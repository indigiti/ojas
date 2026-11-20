<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/storage.php';
$_SERVER['DOCUMENT_ROOT'] = getenv('OJAS_DOCUMENT_ROOT') ?: '';
$email = strtolower(trim($argv[1] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email)>254) exit("Usage: php invite.php email@example.com\n");
$password = bin2hex(random_bytes(16));
store('users', function ($users) use ($email,$password) {
    if (isset($users[$email])) throw new RuntimeException('Account already exists');
    $users[$email] = ['id'=>bin2hex(random_bytes(16)), 'hash'=>password_hash($password,PASSWORD_DEFAULT)];
    return $users;
});
echo "Pilot account: $email\nPassword (shown once): $password\n";
