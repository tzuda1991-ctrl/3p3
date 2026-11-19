<?php
header('Content-Type: application/json');

$codeIgniterPresent = file_exists(__DIR__ . '/application/config/database.php') && file_exists(__DIR__ . '/system/core/CodeIgniter.php');

$dbHost = getenv('DB_HOST') ?: getenv('MYSQLHOST') ?: null;
$dbName = getenv('DB_NAME') ?: getenv('MYSQLDATABASE') ?: null;

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
    'message' => $codeIgniterPresent
        ? 'CodeIgniter files detected.'
        : 'Railway PHP container is running. Drop CodeIgniter application/, system/, and index.php from a complete backend backup into /backend to enable game APIs.',
], JSON_PRETTY_PRINT);
