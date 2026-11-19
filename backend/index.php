<?php
header('Content-Type: application/json');

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$codeIgniterPresent = file_exists(__DIR__ . '/application/config/database.php')
    && file_exists(__DIR__ . '/system/core/CodeIgniter.php');

$dbHost = getenv('DB_HOST') ?: getenv('MYSQLHOST') ?: null;
$dbPort = getenv('DB_PORT') ?: getenv('MYSQLPORT') ?: '3306';
$dbUser = getenv('DB_USERNAME') ?: getenv('MYSQLUSER') ?: 'root';
$dbPass = getenv('DB_PASSWORD') ?: getenv('MYSQLPASSWORD') ?: '';
$dbName = getenv('DB_NAME') ?: getenv('MYSQLDATABASE') ?: null;

// Support basic game_on_off endpoint so Splashscreen works while full CodeIgniter backup is being restored
if (stripos($uri, '/api/user/game_on_off') !== false) {
    echo json_encode([
        'code' => '200',
        'message' => 'Success',
        'game_setting' => [
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
        ],
    ]);
    exit;
}

$dbConnected = false;
if ($dbHost && $dbName && extension_loaded('mysqli')) {
    $conn = @new mysqli($dbHost, $dbUser, $dbPass, $dbName, (int) $dbPort);
    if (!$conn->connect_error) {
        $dbConnected = true;
        $conn->close();
    }
}

echo json_encode([
    'service' => 'teenpatti-php-backend',
    'status' => $codeIgniterPresent ? 'ready' : 'awaiting_codeigniter_application_files',
    'php_version' => PHP_VERSION,
    'extensions' => [
        'mysqli' => extension_loaded('mysqli'),
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'gd' => extension_loaded('gd'),
        'zip' => extension_loaded('zip'),
    ],
    'database_env_configured' => (bool) ($dbHost && $dbName),
    'database_connected' => $dbConnected,
    'starter_sql' => 'backend/database.sql',
    'message' => $codeIgniterPresent
        ? 'CodeIgniter files detected.'
        : 'Railway PHP container is running. Import backend/database.sql into Railway MySQL and drop CodeIgniter application/ + system/ from a complete backup into /backend for full game APIs.',
], JSON_PRETTY_PRINT);
