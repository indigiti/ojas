<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if (!is_string($path) || !str_starts_with($path, '/ojas/api/v1/')) {
    http_response_code(404);
    exit;
}

$private = dirname(__DIR__, 2) . '/private_html/ojas';
$runtime = $private . '/runtime';
$entry = $private . '/api/public/index.php';

if (!is_file($entry) || is_link($runtime) ||
    (!is_dir($runtime) && !@mkdir($runtime, 0700) && !is_dir($runtime))) {
    http_response_code(503);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo '{"error":"OJAS private runtime is unavailable"}';
    exit;
}

putenv('OJAS_DATA_DIR=' . $runtime);
putenv('OJAS_API_PREFIX=/ojas/api/v1');
putenv('OJAS_LOCAL_HTTP=0');
require $entry;
