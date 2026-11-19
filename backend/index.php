<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization, token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$uri = strtolower(trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/'));

// Read POST / JSON params
$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $input = $decoded;
    }
}

$dbHost = getenv('DB_HOST') ?: getenv('MYSQLHOST') ?: null;
$dbPort = (int) (getenv('DB_PORT') ?: getenv('MYSQLPORT') ?: 3306);
$dbUser = getenv('DB_USERNAME') ?: getenv('MYSQLUSER') ?: 'root';
$dbPass = getenv('DB_PASSWORD') ?: getenv('MYSQLPASSWORD') ?: '';
$dbName = getenv('DB_NAME') ?: getenv('MYSQLDATABASE') ?: null;

$mysqli = null;
$dbConnected = false;
$schemaReady = false;
$dbError = null;

if ($dbHost && $dbName && extension_loaded('mysqli')) {
    $mysqli = @new mysqli($dbHost, $dbUser, $dbPass, $dbName, $dbPort);
    if ($mysqli->connect_error) {
        $dbError = $mysqli->connect_error;
        $mysqli = null;
    } else {
        $dbConnected = true;
        $mysqli->set_charset('utf8mb4');
        // Auto-initialize MySQL tables so user never has to manually import SQL
        $sqlFile = __DIR__ . '/database.sql';
        if (file_exists($sqlFile)) {
            $sql = file_get_contents($sqlFile);
            if ($mysqli->multi_query($sql)) {
                while ($mysqli->more_results() && $mysqli->next_result()) {
                    $res = $mysqli->store_result();
                    if ($res) $res->free();
                }
                $schemaReady = true;
            }
        }
        // Seed banners from uploads/banner if tbl_banner is empty
        $cntRes = $mysqli->query('SELECT COUNT(*) AS c FROM tbl_banner');
        if ($cntRes && ($row = $cntRes->fetch_assoc()) && (int)$row['c'] === 0) {
            $bannerDir = __DIR__ . '/uploads/banner';
            if (is_dir($bannerDir)) {
                $files = array_slice(array_values(array_diff(scandir($bannerDir), ['.', '..'])), 0, 5);
                $stmt = $mysqli->prepare('INSERT INTO tbl_banner (banner, status) VALUES (?, 1)');
                foreach ($files as $f) {
                    $stmt->bind_param('s', $f);
                    $stmt->execute();
                }
                $stmt->close();
            }
        }
    }
}

function respond($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data, JSON_PRETTY_PRINT);
    exit;
}

function defaultGameSetting() {
    return [
        'teen_patti' => '1',
        'dragon_tiger' => '1',
        'andar_bahar' => '1',
        'point_rummy' => '1',
        'private_rummy' => '0',
        'pool_rummy' => '0',
        'deal_rummy' => '0',
        'seven_up_down' => '1',
        'car_roulette' => '1',
        'jackpot_teen_patti' => '1',
        'animal_roulette' => '1',
        'color_prediction' => '1',
        'poker' => '0',
        'head_tails' => '0',
        'red_vs_black' => '0',
        'ludo_local' => '0',
        'ludo_online' => '0',
        'ludo_computer' => '0',
        'bacarate' => '0',
        'jhandi_munda' => '0',
        'roulette' => '0',
        'tournament_rummy' => '0',
    ];
}

// 1. Game On/Off settings
if (str_ends_with($uri, 'api/user/game_on_off')) {
    $setting = defaultGameSetting();
    if ($mysqli) {
        $res = $mysqli->query('SELECT * FROM tbl_setting ORDER BY id ASC LIMIT 1');
        if ($res && ($row = $res->fetch_assoc())) {
            foreach ($setting as $k => $v) {
                if (isset($row[$k])) $setting[$k] = (string)$row[$k];
            }
        }
    }
    respond(['code' => '200', 'message' => 'Success', 'game_setting' => $setting]);
}

// 2. Send OTP (returns 1234 test OTP and stores in tbl_otp)
if (str_ends_with($uri, 'api/user/only_send_otp') || str_ends_with($uri, 'api/user/send_otp')) {
    $mobile = trim((string)($input['mobile'] ?? ''));
    if ($mobile === '') {
        respond(['code' => '400', 'message' => 'Mobile number required']);
    }
    $otp = '1234';
    $otpId = '1';
    if ($mysqli) {
        $stmt = $mysqli->prepare('INSERT INTO tbl_otp (mobile, otp) VALUES (?, ?)');
        $stmt->bind_param('ss', $mobile, $otp);
        $stmt->execute();
        $otpId = (string)$stmt->insert_id;
        $stmt->close();
    }
    respond([
        'code' => '200',
        'message' => 'OTP sent (use 1234)',
        'otp_id' => $otpId,
        'otp' => $otp,
    ]);
}

// 3. Register / Login
if (str_ends_with($uri, 'api/user/register') || str_ends_with($uri, 'api/user/login')) {
    $mobile = trim((string)($input['mobile'] ?? ''));
    $password = trim((string)($input['password'] ?? ''));
    $name = trim((string)($input['name'] ?? 'Player'));
    $gender = trim((string)($input['gender'] ?? 'male'));
    $token = bin2hex(random_bytes(16));

    if ($mobile === '') {
        respond(['code' => '400', 'message' => 'Mobile number required']);
    }

    $user = [
        'id' => '1',
        'name' => $name ?: 'Player',
        'mobile' => $mobile,
        'wallet' => '1000.00',
        'token' => $token,
    ];

    if ($mysqli) {
        $stmt = $mysqli->prepare('SELECT id, name, mobile, password, wallet, token FROM tbl_users WHERE mobile = ? LIMIT 1');
        $stmt->bind_param('s', $mobile);
        $stmt->execute();
        $res = $stmt->get_result();
        $existing = $res ? $res->fetch_assoc() : null;
        $stmt->close();

        if ($existing) {
            if (str_ends_with($uri, 'api/user/login') && $password !== '' && $existing['password'] !== '' && $existing['password'] !== $password && !password_verify($password, $existing['password'])) {
                respond(['code' => '401', 'message' => 'Wrong mobile number or password']);
            }
            $upd = $mysqli->prepare('UPDATE tbl_users SET token = ? WHERE id = ?');
            $upd->bind_param('si', $token, $existing['id']);
            $upd->execute();
            $upd->close();
            $user = [
                'id' => (string)$existing['id'],
                'name' => (string)$existing['name'],
                'mobile' => (string)$existing['mobile'],
                'wallet' => (string)$existing['wallet'],
                'token' => $token,
            ];
        } else {
            $refCode = 'TP' . strtoupper(substr(md5($mobile . time()), 0, 6));
            $passHash = $password !== '' ? password_hash($password, PASSWORD_BCRYPT) : '';
            $ins = $mysqli->prepare('INSERT INTO tbl_users (name, mobile, password, gender, referral_code, token) VALUES (?, ?, ?, ?, ?, ?)');
            $ins->bind_param('ssssss', $name, $mobile, $passHash, $gender, $refCode, $token);
            $ins->execute();
            $newId = (string)$ins->insert_id;
            $ins->close();
            $user = [
                'id' => $newId,
                'name' => $name ?: 'Player',
                'mobile' => $mobile,
                'wallet' => '1000.00',
                'token' => $token,
            ];
        }
    }

    respond([
        'code' => '201',
        'message' => 'Login Successful',
        'token' => $token,
        'user' => [$user],
        'user_data' => [$user],
    ]);
}

// 4. User Profile + Banners
if (str_ends_with($uri, 'api/user/profile')) {
    $userId = (int)($input['user_id'] ?? $input['id'] ?? 0);
    $userData = [
        'id' => (string)($userId ?: 1),
        'name' => 'Player',
        'mobile' => '',
        'profile_pic' => '',
        'referral_code' => 'TP1000',
        'wallet' => '1000.00',
        'winning_wallet' => '0.00',
        'spin_remaining' => '3',
        'game_played' => '0',
        'bank_detail' => '',
        'upi' => '',
        'adhar_card' => '',
    ];
    $banners = [];

    if ($mysqli) {
        if ($userId > 0) {
            $stmt = $mysqli->prepare('SELECT * FROM tbl_users WHERE id = ? LIMIT 1');
            $stmt->bind_param('i', $userId);
            $stmt->execute();
            $res = $stmt->get_result();
            if ($res && ($row = $res->fetch_assoc())) {
                foreach ($userData as $k => $v) {
                    if (isset($row[$k])) $userData[$k] = (string)$row[$k];
                }
            }
            $stmt->close();
        }
        $bRes = $mysqli->query('SELECT id, banner FROM tbl_banner WHERE status = 1 ORDER BY id ASC LIMIT 10');
        if ($bRes) {
            while ($b = $bRes->fetch_assoc()) {
                $banners[] = ['id' => (string)$b['id'], 'banner' => (string)$b['banner']];
            }
        }
    }

    respond([
        'code' => '200',
        'message' => 'Success',
        'user_data' => [$userData],
        'app_banner' => $banners,
        'setting' => [
            'referral_amount' => '50',
            'joining_amount' => '100',
            'app_version' => '1.0',
        ],
    ]);
}

// 5. Banners / Settings / Leaderboard / Profile Updates
if (str_ends_with($uri, 'api/banner/list')) {
    $banners = [];
    if ($mysqli) {
        $bRes = $mysqli->query('SELECT id, banner FROM tbl_banner WHERE status = 1 ORDER BY id ASC');
        if ($bRes) {
            while ($b = $bRes->fetch_assoc()) {
                $banners[] = ['id' => (string)$b['id'], 'banner' => (string)$b['banner']];
            }
        }
    }
    respond(['code' => '200', 'message' => 'Success', 'banner' => $banners]);
}

if (str_ends_with($uri, 'api/user/setting')) {
    respond([
        'code' => '200',
        'message' => 'Success',
        'setting' => [
            'terms' => 'Play responsibly. 18+ only.',
            'privacy_policy' => 'Your data is stored securely.',
            'referral_amount' => '50',
            'joining_amount' => '100',
            'app_version' => '1.0',
        ],
    ]);
}

if (str_ends_with($uri, 'api/user/leaderboard')) {
    $leaders = [];
    if ($mysqli) {
        $res = $mysqli->query('SELECT id, name, wallet, profile_pic FROM tbl_users ORDER BY wallet DESC LIMIT 20');
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $leaders[] = [
                    'id' => (string)$r['id'],
                    'name' => (string)$r['name'],
                    'wallet' => (string)$r['wallet'],
                    'profile_pic' => (string)$r['profile_pic'],
                ];
            }
        }
    }
    respond(['code' => '200', 'message' => 'Success', 'leaderboard' => $leaders]);
}

if (str_ends_with($uri, 'api/user/update_profile') || str_ends_with($uri, 'api/user/update_bank_details') || str_ends_with($uri, 'api/user/update_kyc')) {
    $userId = (int)($input['user_id'] ?? 0);
    if ($mysqli && $userId > 0) {
        $name = (string)($input['name'] ?? '');
        $bank = (string)($input['bank_detail'] ?? '');
        $upi = (string)($input['upi'] ?? '');
        $adhar = (string)($input['adhar_card'] ?? '');
        $stmt = $mysqli->prepare('UPDATE tbl_users SET name = IF(? != "", ?, name), bank_detail = IF(? != "", ?, bank_detail), upi = IF(? != "", ?, upi), adhar_card = IF(? != "", ?, adhar_card) WHERE id = ?');
        $stmt->bind_param('ssssssssi', $name, $name, $bank, $bank, $upi, $upi, $adhar, $adhar, $userId);
        $stmt->execute();
        $stmt->close();
    }
    respond(['code' => '200', 'message' => 'Updated Successfully']);
}

// Default health / status response
$codeIgniterPresent = file_exists(__DIR__ . '/application/config/database.php')
    && file_exists(__DIR__ . '/system/core/CodeIgniter.php');

respond([
    'service' => 'teenpatti-php-backend',
    'status' => $dbConnected ? 'ready' : 'awaiting_mysql_variables',
    'php_version' => PHP_VERSION,
    'database_env_configured' => (bool)($dbHost && $dbName),
    'database_connected' => $dbConnected,
    'database_schema_auto_initialized' => $schemaReady,
    'database_error' => $dbError,
    'codeigniter_detected' => $codeIgniterPresent,
    'endpoints' => [
        'POST /api/user/game_on_off',
        'POST /api/User/only_send_otp',
        'POST /api/User/register',
        'POST /api/User/login',
        'POST /api/User/profile',
        'POST /api/banner/list',
        'POST /api/user/setting',
        'POST /api/User/leaderboard',
    ],
]);
