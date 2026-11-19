<?php
session_start();
header('Content-Type: text/html; charset=utf-8');

$dbHost = getenv('DB_HOST') ?: getenv('MYSQLHOST') ?: null;
$dbPort = (int) (getenv('DB_PORT') ?: getenv('MYSQLPORT') ?: 3306);
$dbUser = getenv('DB_USERNAME') ?: getenv('MYSQLUSER') ?: 'root';
$dbPass = getenv('DB_PASSWORD') ?: getenv('MYSQLPASSWORD') ?: '';
$dbName = getenv('DB_NAME') ?: getenv('MYSQLDATABASE') ?: null;

$adminEmailEnv = getenv('ADMIN_EMAIL') ?: 'admin@teenpatti.com';
$adminPassEnv = getenv('ADMIN_PASSWORD') ?: 'Admin@1234';

$mysqli = null;
$dbError = null;
if ($dbHost && $dbName && extension_loaded('mysqli')) {
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = mysqli_init();
    $mysqli->options(MYSQLI_OPT_CONNECT_TIMEOUT, 3);
    $ok = @$mysqli->real_connect($dbHost, $dbUser, $dbPass, $dbName, $dbPort);
    if (!$ok || $mysqli->connect_error) {
        $dbError = $mysqli->connect_error ?: 'Unable to connect to MySQL';
        $mysqli = null;
    } else {
        $mysqli->set_charset('utf8mb4');
        $sqlFile = __DIR__ . '/database.sql';
        if (file_exists($sqlFile)) {
            $sql = file_get_contents($sqlFile);
            if ($mysqli->multi_query($sql)) {
                while ($mysqli->more_results() && $mysqli->next_result()) {
                    $r = $mysqli->store_result();
                    if ($r) $r->free();
                }
            }
        }
        $mysqli->query("CREATE TABLE IF NOT EXISTS tbl_admin (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(160) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $chk = $mysqli->query("SELECT COUNT(*) AS c FROM tbl_admin");
        if ($chk && ($row = $chk->fetch_assoc()) && (int)$row['c'] === 0) {
            $hash = password_hash($adminPassEnv, PASSWORD_BCRYPT);
            $st = $mysqli->prepare("INSERT INTO tbl_admin (email, password_hash) VALUES (?, ?)");
            $st->bind_param('ss', $adminEmailEnv, $hash);
            $st->execute();
            $st->close();
        }
    }
}

$flash = null;
$flashType = 'success';

// Handle Logout
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: /admin');
    exit;
}

// Handle Login
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
    $email = trim((string)($_POST['email'] ?? ''));
    $pass = (string)($_POST['password'] ?? '');
    $authed = false;

    if ($mysqli) {
        $st = $mysqli->prepare("SELECT id, email, password_hash FROM tbl_admin WHERE email = ? LIMIT 1");
        $st->bind_param('s', $email);
        $st->execute();
        $res = $st->get_result();
        $adm = $res ? $res->fetch_assoc() : null;
        $st->close();
        if ($adm && password_verify($pass, $adm['password_hash'])) {
            $authed = true;
        }
    }
    if (!$authed && strcasecmp($email, $adminEmailEnv) === 0 && hash_equals($adminPassEnv, $pass)) {
        $authed = true;
    }

    if ($authed) {
        $_SESSION['tp_admin_logged_in'] = true;
        $_SESSION['tp_admin_email'] = $email;
        header('Location: /admin');
        exit;
    } else {
        $flash = 'Invalid email or password.';
        $flashType = 'error';
    }
}

$isAuthed = !empty($_SESSION['tp_admin_logged_in']);
$tab = $_GET['tab'] ?? 'dashboard';

// Handle Authenticated POST Actions
if ($isAuthed && $_SERVER['REQUEST_METHOD'] === 'POST' && $mysqli) {
    $action = $_POST['action'] ?? '';

    if ($action === 'adjust_wallet') {
        $uid = (int)($_POST['user_id'] ?? 0);
        $amount = (float)($_POST['amount'] ?? 0);
        $mode = $_POST['mode'] ?? 'credit';
        if ($uid > 0 && $amount > 0) {
            if ($mode === 'debit') {
                $st = $mysqli->prepare("UPDATE tbl_users SET wallet = GREATEST(0, wallet - ?) WHERE id = ?");
            } else {
                $st = $mysqli->prepare("UPDATE tbl_users SET wallet = wallet + ? WHERE id = ?");
            }
            $st->bind_param('di', $amount, $uid);
            $st->execute();
            $st->close();

            $tType = $mode === 'debit' ? 'admin_debit' : 'admin_credit';
            $txn = $mysqli->prepare("INSERT INTO tbl_transactions (user_id, amount, type, gateway, txn_ref, status) VALUES (?, ?, ?, 'admin', ?, 'completed')");
            $ref = 'ADM' . time();
            $txn->bind_param('idss', $uid, $amount, $tType, $ref);
            $txn->execute();
            $txn->close();
            $flash = "Wallet updated (" . ($mode === 'debit' ? '-' : '+') . "₹" . number_format($amount, 2) . ") for User #$uid.";
        }
        $tab = 'users';
    } elseif ($action === 'toggle_user') {
        $uid = (int)($_POST['user_id'] ?? 0);
        if ($uid > 0) {
            $mysqli->query("UPDATE tbl_users SET status = IF(status=1, 0, 1) WHERE id = " . $uid);
            $flash = "User #$uid status updated.";
        }
        $tab = 'users';
    } elseif ($action === 'create_user') {
        $name = trim((string)($_POST['name'] ?? 'Player'));
        $mobile = trim((string)($_POST['mobile'] ?? ''));
        $password = trim((string)($_POST['password'] ?? '123456'));
        $wallet = (float)($_POST['wallet'] ?? 1000);
        if ($mobile !== '') {
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $ref = 'TP' . strtoupper(substr(md5($mobile . time()), 0, 6));
            $tok = bin2hex(random_bytes(16));
            $st = $mysqli->prepare("INSERT INTO tbl_users (name, mobile, password, wallet, referral_code, token) VALUES (?, ?, ?, ?, ?, ?)");
            $st->bind_param('sssdss', $name, $mobile, $hash, $wallet, $ref, $tok);
            if ($st->execute()) {
                $flash = "Player '$name' ($mobile) created with ₹" . number_format($wallet, 2) . ".";
            } else {
                $flash = "Could not create user (mobile may already exist).";
                $flashType = 'error';
            }
            $st->close();
        }
        $tab = 'users';
    } elseif ($action === 'save_games') {
        $gameCols = [
            'teen_patti','dragon_tiger','andar_bahar','point_rummy','private_rummy',
            'pool_rummy','deal_rummy','seven_up_down','car_roulette','jackpot_teen_patti',
            'animal_roulette','color_prediction','poker','head_tails','red_vs_black',
            'ludo_local','ludo_online','ludo_computer','bacarate','jhandi_munda',
            'roulette','tournament_rummy'
        ];
        $sets = [];
        foreach ($gameCols as $c) {
            $val = isset($_POST[$c]) ? 1 : 0;
            $sets[] = "$c = $val";
        }
        $refAmt = (float)($_POST['referral_amount'] ?? 50);
        $joinAmt = (float)($_POST['joining_amount'] ?? 100);
        $ver = $mysqli->real_escape_string(trim((string)($_POST['app_version'] ?? '1.0')));
        $terms = $mysqli->real_escape_string(trim((string)($_POST['terms'] ?? '')));
        $privacy = $mysqli->real_escape_string(trim((string)($_POST['privacy_policy'] ?? '')));
        $sql = "UPDATE tbl_setting SET " . implode(', ', $sets) . ", referral_amount = $refAmt, joining_amount = $joinAmt, app_version = '$ver', terms = '$terms', privacy_policy = '$privacy' WHERE id = 1";
        $mysqli->query($sql);
        $flash = "Game toggles and app settings saved! Live in Android app.";
        $tab = 'games';
    } elseif ($action === 'withdrawal_status') {
        $wid = (int)($_POST['withdrawal_id'] ?? 0);
        $newStatus = (int)($_POST['status'] ?? 1);
        if ($wid > 0) {
            $row = $mysqli->query("SELECT user_id, coin, status FROM tbl_withdrawal_log WHERE id = $wid")->fetch_assoc();
            if ($row && (int)$row['status'] === 0) {
                $mysqli->query("UPDATE tbl_withdrawal_log SET status = $newStatus WHERE id = $wid");
                if ($newStatus === 2) {
                    $refund = (float)$row['coin'];
                    $uid = (int)$row['user_id'];
                    $mysqli->query("UPDATE tbl_users SET wallet = wallet + $refund WHERE id = $uid");
                }
                $flash = $newStatus === 1 ? "Withdrawal #$wid approved." : "Withdrawal #$wid rejected & refunded.";
            }
        }
        $tab = 'withdrawals';
    } elseif ($action === 'toggle_banner') {
        $bid = (int)($_POST['banner_id'] ?? 0);
        if ($bid > 0) {
            $mysqli->query("UPDATE tbl_banner SET status = IF(status=1, 0, 1) WHERE id = $bid");
            $flash = "Banner #$bid visibility toggled.";
        }
        $tab = 'banners';
    } elseif ($action === 'delete_banner') {
        $bid = (int)($_POST['banner_id'] ?? 0);
        if ($bid > 0) {
            $mysqli->query("DELETE FROM tbl_banner WHERE id = $bid");
            $flash = "Banner #$bid removed.";
        }
        $tab = 'banners';
    } elseif ($action === 'upload_banner' && !empty($_FILES['banner_file']['name'])) {
        $ext = strtolower(pathinfo($_FILES['banner_file']['name'], PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
            $dir = __DIR__ . '/uploads/banner';
            if (!is_dir($dir)) mkdir($dir, 0775, true);
            $fname = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
            if (move_uploaded_file($_FILES['banner_file']['tmp_name'], $dir . '/' . $fname)) {
                $st = $mysqli->prepare("INSERT INTO tbl_banner (banner, status) VALUES (?, 1)");
                $st->bind_param('s', $fname);
                $st->execute();
                $st->close();
                $flash = "Banner uploaded: $fname";
            }
        } else {
            $flash = "Only JPG, PNG, WEBP, or GIF images are allowed.";
            $flashType = 'error';
        }
        $tab = 'banners';
    } elseif ($action === 'change_admin_password') {
        $newPass = trim((string)($_POST['new_password'] ?? ''));
        if (strlen($newPass) >= 6) {
            $hash = password_hash($newPass, PASSWORD_BCRYPT);
            $email = $_SESSION['tp_admin_email'] ?? $adminEmailEnv;
            $st = $mysqli->prepare("UPDATE tbl_admin SET password_hash = ? WHERE email = ?");
            $st->bind_param('ss', $hash, $email);
            $st->execute();
            $st->close();
            $flash = "Admin password updated successfully.";
        } else {
            $flash = "Password must be at least 6 characters.";
            $flashType = 'error';
        }
        $tab = 'settings';
    }
}

function h($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }

// Load Data if Authenticated
$stats = ['users' => 0, 'wallet' => 0, 'pending_wd' => 0, 'txns' => 0, 'banners' => 0, 'games_on' => 0];
$setting = [];
$users = [];
$withdrawals = [];
$transactions = [];
$banners = [];

if ($isAuthed && $mysqli) {
    $r = $mysqli->query("SELECT COUNT(*) c, COALESCE(SUM(wallet),0) w FROM tbl_users")->fetch_assoc();
    $stats['users'] = (int)($r['c'] ?? 0);
    $stats['wallet'] = (float)($r['w'] ?? 0);
    $r = $mysqli->query("SELECT COUNT(*) c FROM tbl_withdrawal_log WHERE status = 0")->fetch_assoc();
    $stats['pending_wd'] = (int)($r['c'] ?? 0);
    $r = $mysqli->query("SELECT COUNT(*) c FROM tbl_transactions")->fetch_assoc();
    $stats['txns'] = (int)($r['c'] ?? 0);
    $r = $mysqli->query("SELECT COUNT(*) c FROM tbl_banner WHERE status = 1")->fetch_assoc();
    $stats['banners'] = (int)($r['c'] ?? 0);

    $setting = $mysqli->query("SELECT * FROM tbl_setting ORDER BY id ASC LIMIT 1")->fetch_assoc() ?: [];
    $gameKeys = [
        'teen_patti','dragon_tiger','andar_bahar','point_rummy','private_rummy',
        'pool_rummy','deal_rummy','seven_up_down','car_roulette','jackpot_teen_patti',
        'animal_roulette','color_prediction','poker','head_tails','red_vs_black',
        'ludo_local','ludo_online','ludo_computer','bacarate','jhandi_munda',
        'roulette','tournament_rummy'
    ];
    foreach ($gameKeys as $gk) {
        if (!empty($setting[$gk])) $stats['games_on']++;
    }

    if ($tab === 'users' || $tab === 'dashboard') {
        $q = trim((string)($_GET['q'] ?? ''));
        if ($q !== '') {
            $like = '%' . $mysqli->real_escape_string($q) . '%';
            $uRes = $mysqli->query("SELECT * FROM tbl_users WHERE name LIKE '$like' OR mobile LIKE '$like' OR id = " . (int)$q . " ORDER BY id DESC LIMIT 100");
        } else {
            $uRes = $mysqli->query("SELECT * FROM tbl_users ORDER BY id DESC LIMIT 100");
        }
        while ($uRes && ($row = $uRes->fetch_assoc())) $users[] = $row;
    }

    if ($tab === 'withdrawals') {
        $wRes = $mysqli->query("SELECT w.*, u.name, u.mobile, u.upi FROM tbl_withdrawal_log w LEFT JOIN tbl_users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 100");
        while ($wRes && ($row = $wRes->fetch_assoc())) $withdrawals[] = $row;
        $tRes = $mysqli->query("SELECT t.*, u.name, u.mobile FROM tbl_transactions t LEFT JOIN tbl_users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 100");
        while ($tRes && ($row = $tRes->fetch_assoc())) $transactions[] = $row;
    }

    if ($tab === 'banners') {
        $bRes = $mysqli->query("SELECT * FROM tbl_banner ORDER BY id DESC");
        while ($bRes && ($row = $bRes->fetch_assoc())) $banners[] = $row;
    }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Teen Patti Champion — Admin Panel</title>
<style>
  :root {
    --bg: #0b1120; --surface: #111827; --card: #1e293b; --border: #334155;
    --text: #f8fafc; --muted: #94a3b8; --gold: #f59e0b; --green: #22c55e; --red: #ef4444; --blue: #3b82f6;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); }
  a { color: inherit; text-decoration: none; }
  .topbar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 20px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; position: sticky; top: 0; z-index: 20; }
  .brand { font-weight: 700; font-size: 18px; color: var(--gold); display: flex; align-items: center; gap: 8px; }
  .nav { display: flex; flex-wrap: wrap; gap: 6px; }
  .nav a { padding: 8px 13px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--muted); background: transparent; border: 1px solid transparent; }
  .nav a.active, .nav a:hover { color: var(--text); background: var(--card); border-color: var(--border); }
  .nav a.logout { color: #fca5a5; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 20px 16px 60px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .stat-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .stat-val { font-size: 26px; font-weight: 700; margin-top: 6px; }
  .gold { color: var(--gold); } .green { color: var(--green); } .red { color: var(--red); }
  .flash { padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 14px; font-weight: 500; }
  .flash.success { background: rgba(34,197,94,.14); border: 1px solid rgba(34,197,94,.4); color: #86efac; }
  .flash.error { background: rgba(239,68,68,.14); border: 1px solid rgba(239,68,68,.4); color: #fca5a5; }
  h2 { margin: 0 0 14px; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
  .table-wrap { overflow-x: auto; }
  input, select, textarea { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; font-size: 14px; width: 100%; }
  button, .btn { background: var(--gold); color: #111827; font-weight: 700; border: 0; border-radius: 8px; padding: 9px 14px; cursor: pointer; font-size: 13px; display: inline-block; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn-green { background: var(--green); color: #052e16; }
  .btn-red { background: var(--red); color: #fff; }
  .btn-slate { background: var(--card); color: var(--text); border: 1px solid var(--border); }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
  .badge-on { background: rgba(34,197,94,.16); color: #86efac; }
  .badge-off { background: rgba(239,68,68,.16); color: #fca5a5; }
  .badge-warn { background: rgba(245,158,11,.16); color: #fcd34d; }
  .games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .toggle-box { display: flex; align-items: center; justify-content: space-between; background: var(--card); border: 1px solid var(--border); padding: 11px 12px; border-radius: 10px; }
  .toggle-box input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--gold); }
  .login-box { max-width: 400px; margin: 70px auto; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 26px; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 600; }
  .banner-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  .banner-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .banner-card img { width: 100%; height: 110px; object-fit: cover; display: block; background: #0f172a; }
  .banner-card .body { padding: 10px; }
</style>
</head>
<body>

<?php if (!$isAuthed): ?>
  <div class="login-box">
    <div class="brand" style="margin-bottom:6px; font-size:20px;">♠ Teen Patti Champion</div>
    <p style="color:var(--muted); font-size:13px; margin:0 0 18px;">Admin Control Panel — Railway MySQL</p>
    <?php if ($flash): ?><div class="flash <?= h($flashType) ?>"><?= h($flash) ?></div><?php endif; ?>
    <?php if ($dbError): ?><div class="flash error">MySQL Error: <?= h($dbError) ?></div><?php endif; ?>
    <form method="post">
      <input type="hidden" name="action" value="login" />
      <div class="field">
        <label>Admin Email</label>
        <input type="email" name="email" required value="<?= h($adminEmailEnv) ?>" />
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" required placeholder="Enter password" />
      </div>
      <button type="submit" style="width:100%; padding:11px;">Sign In to Admin Panel</button>
    </form>
  </div>
<?php else: ?>
  <div class="topbar">
    <div class="brand">♠ Teen Patti Admin</div>
    <div class="nav">
      <a href="/admin?tab=dashboard" class="<?= $tab==='dashboard'?'active':'' ?>">Dashboard</a>
      <a href="/admin?tab=users" class="<?= $tab==='users'?'active':'' ?>">Users (<?= $stats['users'] ?>)</a>
      <a href="/admin?tab=games" class="<?= $tab==='games'?'active':'' ?>">Games & Config</a>
      <a href="/admin?tab=withdrawals" class="<?= $tab==='withdrawals'?'active':'' ?>">Wallet & Payouts</a>
      <a href="/admin?tab=banners" class="<?= $tab==='banners'?'active':'' ?>">Banners</a>
      <a href="/admin?tab=settings" class="<?= $tab==='settings'?'active':'' ?>">Security</a>
      <a href="/admin?logout=1" class="logout">Logout</a>
    </div>
  </div>

  <div class="wrap">
    <?php if ($flash): ?><div class="flash <?= h($flashType) ?>"><?= h($flash) ?></div><?php endif; ?>
    <?php if ($dbError): ?><div class="flash error">MySQL Error: <?= h($dbError) ?></div><?php endif; ?>

    <?php if ($tab === 'dashboard'): ?>
      <div class="grid">
        <div class="card"><div class="stat-label">Total Players</div><div class="stat-val"><?= $stats['users'] ?></div></div>
        <div class="card"><div class="stat-label">Total Wallet Chips</div><div class="stat-val gold">₹<?= number_format($stats['wallet'], 2) ?></div></div>
        <div class="card"><div class="stat-label">Active Games</div><div class="stat-val green"><?= $stats['games_on'] ?> / 22</div></div>
        <div class="card"><div class="stat-label">Pending Withdrawals</div><div class="stat-val"><?= $stats['pending_wd'] ?></div></div>
        <div class="card"><div class="stat-label">Active Banners</div><div class="stat-val"><?= $stats['banners'] ?></div></div>
      </div>

      <div class="card" style="margin-bottom:18px;">
        <h2>System & Railway Status</h2>
        <div class="row" style="gap:16px; font-size:13px;">
          <div>MySQL: <span class="badge <?= $mysqli?'badge-on':'badge-off' ?>"><?= $mysqli?'Connected':'Disconnected' ?></span></div>
          <div>PHP: <span class="badge badge-on"><?= PHP_VERSION ?></span></div>
          <div>API Base: <code>/api/</code></div>
          <div>Default Test OTP: <span class="badge badge-warn">1234</span></div>
        </div>
      </div>

      <div class="card">
        <h2>Recent Players</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Wallet</th><th>Status</th><th>Joined</th></tr></thead>
            <tbody>
            <?php foreach (array_slice($users, 0, 10) as $u): ?>
              <tr>
                <td>#<?= h($u['id']) ?></td>
                <td><?= h($u['name']) ?></td>
                <td><?= h($u['mobile']) ?></td>
                <td class="gold">₹<?= number_format((float)$u['wallet'], 2) ?></td>
                <td><span class="badge <?= $u['status']?'badge-on':'badge-off' ?>"><?= $u['status']?'Active':'Blocked' ?></span></td>
                <td style="color:var(--muted)"><?= h($u['added_date']) ?></td>
              </tr>
            <?php endforeach; ?>
            <?php if (!$users): ?><tr><td colspan="6" style="color:var(--muted); text-align:center; padding:20px;">No players registered yet. Add one in the Users tab or register from the APK.</td></tr><?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>

    <?php elseif ($tab === 'users'): ?>
      <div class="card" style="margin-bottom:16px;">
        <h2>Create Player Account</h2>
        <form method="post" class="row">
          <input type="hidden" name="action" value="create_user" />
          <input name="name" placeholder="Player Name" required style="flex:1; min-width:140px;" />
          <input name="mobile" placeholder="Mobile Number" required style="flex:1; min-width:140px;" />
          <input name="password" placeholder="Password (default 123456)" value="123456" style="flex:1; min-width:130px;" />
          <input name="wallet" type="number" step="0.01" value="1000" placeholder="Starting Chips" style="width:140px;" />
          <button type="submit">+ Add Player</button>
        </form>
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between; margin-bottom:14px;">
          <h2 style="margin:0;">Players & Wallet Management</h2>
          <form method="get" class="row">
            <input type="hidden" name="tab" value="users" />
            <input name="q" value="<?= h($_GET['q'] ?? '') ?>" placeholder="Search mobile / name / ID" style="width:220px;" />
            <button type="submit" class="btn-slate">Search</button>
          </form>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Player</th><th>Mobile</th><th>Wallet</th><th>Status</th><th>Adjust Wallet</th><th>Action</th></tr></thead>
            <tbody>
            <?php foreach ($users as $u): ?>
              <tr>
                <td>#<?= h($u['id']) ?></td>
                <td><?= h($u['name']) ?><div style="font-size:11px; color:var(--muted);">Ref: <?= h($u['referral_code']) ?></div></td>
                <td><?= h($u['mobile']) ?></td>
                <td class="gold"><strong>₹<?= number_format((float)$u['wallet'], 2) ?></strong></td>
                <td><span class="badge <?= $u['status']?'badge-on':'badge-off' ?>"><?= $u['status']?'Active':'Blocked' ?></span></td>
                <td>
                  <form method="post" class="row" style="gap:6px;">
                    <input type="hidden" name="action" value="adjust_wallet" />
                    <input type="hidden" name="user_id" value="<?= h($u['id']) ?>" />
                    <input name="amount" type="number" step="0.01" min="1" placeholder="Amt" required style="width:85px; padding:6px;" />
                    <button name="mode" value="credit" class="btn-sm btn-green">+Add</button>
                    <button name="mode" value="debit" class="btn-sm btn-red">-Cut</button>
                  </form>
                </td>
                <td>
                  <form method="post">
                    <input type="hidden" name="action" value="toggle_user" />
                    <input type="hidden" name="user_id" value="<?= h($u['id']) ?>" />
                    <button type="submit" class="btn-sm btn-slate"><?= $u['status']?'Block':'Unblock' ?></button>
                  </form>
                </td>
              </tr>
            <?php endforeach; ?>
            <?php if (!$users): ?><tr><td colspan="7" style="color:var(--muted); text-align:center; padding:20px;">No players found.</td></tr><?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>

    <?php elseif ($tab === 'games'): ?>
      <form method="post" class="card">
        <input type="hidden" name="action" value="save_games" />
        <h2>Live Game On / Off Controls</h2>
        <div class="games-grid">
          <?php
            $labels = [
              'teen_patti' => 'Teen Patti', 'dragon_tiger' => 'Dragon vs Tiger', 'andar_bahar' => 'Andar Bahar',
              'point_rummy' => 'Point Rummy', 'private_rummy' => 'Private Rummy', 'pool_rummy' => 'Pool Rummy',
              'deal_rummy' => 'Deal Rummy', 'seven_up_down' => '7 Up Down', 'car_roulette' => 'Car Roulette',
              'jackpot_teen_patti' => 'Jackpot Teen Patti', 'animal_roulette' => 'Animal Roulette',
              'color_prediction' => 'Color Prediction', 'poker' => 'Poker', 'head_tails' => 'Head & Tails',
              'red_vs_black' => 'Red vs Black', 'ludo_local' => 'Ludo Local', 'ludo_online' => 'Ludo Online',
              'ludo_computer' => 'Ludo Computer', 'bacarate' => 'Baccarat', 'jhandi_munda' => 'Jhandi Munda',
              'roulette' => 'Roulette', 'tournament_rummy' => 'Tournament Rummy',
            ];
            foreach ($labels as $col => $lbl):
              $checked = !empty($setting[$col]);
          ?>
            <label class="toggle-box">
              <span><?= h($lbl) ?></span>
              <input type="checkbox" name="<?= h($col) ?>" value="1" <?= $checked?'checked':'' ?> />
            </label>
          <?php endforeach; ?>
        </div>

        <h2>App Bonus & Policy Settings</h2>
        <div class="grid">
          <div class="field"><label>Referral Bonus (₹)</label><input type="number" step="0.01" name="referral_amount" value="<?= h($setting['referral_amount'] ?? '50') ?>" /></div>
          <div class="field"><label>Joining Bonus (₹)</label><input type="number" step="0.01" name="joining_amount" value="<?= h($setting['joining_amount'] ?? '100') ?>" /></div>
          <div class="field"><label>App Version</label><input type="text" name="app_version" value="<?= h($setting['app_version'] ?? '1.0') ?>" /></div>
        </div>
        <div class="field"><label>Terms & Conditions</label><textarea name="terms" rows="3"><?= h($setting['terms'] ?? '') ?></textarea></div>
        <div class="field"><label>Privacy Policy</label><textarea name="privacy_policy" rows="3"><?= h($setting['privacy_policy'] ?? '') ?></textarea></div>
        <button type="submit">Save Game & App Settings</button>
      </form>

    <?php elseif ($tab === 'withdrawals'): ?>
      <div class="card" style="margin-bottom:18px;">
        <h2>Withdrawal Requests</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Player</th><th>UPI</th><th>Amount</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>
            <?php foreach ($withdrawals as $w): ?>
              <tr>
                <td>#<?= h($w['id']) ?></td>
                <td><?= h($w['name'] ?: 'User #'.$w['user_id']) ?> (<?= h($w['mobile']) ?>)</td>
                <td><?= h($w['upi'] ?: '-') ?></td>
                <td class="gold">₹<?= number_format((float)$w['coin'], 2) ?></td>
                <td>
                  <?php if ((int)$w['status']===0): ?><span class="badge badge-warn">Pending</span>
                  <?php elseif ((int)$w['status']===1): ?><span class="badge badge-on">Approved</span>
                  <?php else: ?><span class="badge badge-off">Rejected</span><?php endif; ?>
                </td>
                <td style="color:var(--muted)"><?= h($w['added_date']) ?></td>
                <td>
                  <?php if ((int)$w['status']===0): ?>
                  <form method="post" class="row" style="gap:6px;">
                    <input type="hidden" name="action" value="withdrawal_status" />
                    <input type="hidden" name="withdrawal_id" value="<?= h($w['id']) ?>" />
                    <button name="status" value="1" class="btn-sm btn-green">Approve</button>
                    <button name="status" value="2" class="btn-sm btn-red">Reject</button>
                  </form>
                  <?php else: ?>—<?php endif; ?>
                </td>
              </tr>
            <?php endforeach; ?>
            <?php if (!$withdrawals): ?><tr><td colspan="7" style="color:var(--muted); text-align:center; padding:18px;">No withdrawal requests yet.</td></tr><?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>Wallet Transactions</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Player</th><th>Type</th><th>Amount</th><th>Ref</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
            <?php foreach ($transactions as $t): ?>
              <tr>
                <td>#<?= h($t['id']) ?></td>
                <td><?= h($t['name'] ?: 'User #'.$t['user_id']) ?></td>
                <td><?= h($t['type']) ?></td>
                <td class="gold">₹<?= number_format((float)$t['amount'], 2) ?></td>
                <td><code><?= h($t['txn_ref']) ?></code></td>
                <td><span class="badge badge-on"><?= h($t['status']) ?></span></td>
                <td style="color:var(--muted)"><?= h($t['added_date']) ?></td>
              </tr>
            <?php endforeach; ?>
            <?php if (!$transactions): ?><tr><td colspan="7" style="color:var(--muted); text-align:center; padding:18px;">No transactions recorded yet.</td></tr><?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>

    <?php elseif ($tab === 'banners'): ?>
      <div class="card" style="margin-bottom:16px;">
        <h2>Upload New Banner</h2>
        <form method="post" enctype="multipart/form-data" class="row">
          <input type="hidden" name="action" value="upload_banner" />
          <input type="file" name="banner_file" accept="image/*" required style="flex:1;" />
          <button type="submit">Upload Banner</button>
        </form>
      </div>
      <div class="banner-grid">
        <?php foreach ($banners as $b): ?>
          <div class="banner-card">
            <img src="/uploads/banner/<?= h($b['banner']) ?>" alt="banner" />
            <div class="body">
              <div style="font-size:12px; color:var(--muted); margin-bottom:8px; word-break:break-all;"><?= h($b['banner']) ?></div>
              <div class="row" style="justify-content:space-between;">
                <span class="badge <?= $b['status']?'badge-on':'badge-off' ?>"><?= $b['status']?'Active':'Hidden' ?></span>
                <div class="row" style="gap:6px;">
                  <form method="post">
                    <input type="hidden" name="action" value="toggle_banner" />
                    <input type="hidden" name="banner_id" value="<?= h($b['id']) ?>" />
                    <button class="btn-sm btn-slate"><?= $b['status']?'Hide':'Show' ?></button>
                  </form>
                  <form method="post">
                    <input type="hidden" name="action" value="delete_banner" />
                    <input type="hidden" name="banner_id" value="<?= h($b['id']) ?>" />
                    <button class="btn-sm btn-red">Del</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        <?php endforeach; ?>
      </div>

    <?php elseif ($tab === 'settings'): ?>
      <div class="card" style="max-width:460px;">
        <h2>Change Admin Password</h2>
        <p style="font-size:13px; color:var(--muted);">Logged in as <strong><?= h($_SESSION['tp_admin_email'] ?? $adminEmailEnv) ?></strong></p>
        <form method="post">
          <input type="hidden" name="action" value="change_admin_password" />
          <div class="field">
            <label>New Password (min 6 chars)</label>
            <input type="password" name="new_password" minlength="6" required />
          </div>
          <button type="submit">Update Password</button>
        </form>
      </div>
    <?php endif; ?>
  </div>
<?php endif; ?>
</body>
</html>
