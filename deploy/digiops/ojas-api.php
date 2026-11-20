<?php
declare(strict_types=1);

// Installed at public_html/ojas/api/v1/index.php. Direct requests do not need rewrites.
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
$prefix = '/ojas/api/v1';
$route = $uri === $prefix . '/index.php' ? ($_GET['route'] ?? '') :
    (is_string($uri) && str_starts_with($uri, $prefix . '/') ? substr($uri, strlen($prefix)) : '');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (!is_string($route) || !preg_match('~^/[a-z0-9/-]+$~D', $route)) {
    http_response_code(404);
    echo '{"error":"Endpoint not found"}';
    exit;
}

try {
    $private = dirname(__DIR__, 4) . '/private_html/ojas';
    $runtime = $private . '/runtime';
    $entry = $private . '/api/public/index.php';
    if (!is_file($entry) || is_link($runtime) ||
        (!is_dir($runtime) && !@mkdir($runtime, 0700) && !is_dir($runtime))) {
        throw new RuntimeException('Private API or runtime directory unavailable');
    }
    define('OJAS_DEPLOY_DATA_DIR', $runtime);
    define('OJAS_DEPLOY_API_PREFIX', $prefix);
    define('OJAS_DEPLOY_API_ROUTE', $route);
    require $entry;
} catch (Throwable $e) {
    error_log('OJAS gateway: ' . $e->getMessage());
    http_response_code(503);
    echo '{"error":"OJAS API is unavailable. Check the private release and PHP runtime."}';
}
