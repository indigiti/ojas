<?php
declare(strict_types=1);

function data_dir(): string {
    $path = realpath(defined('OJAS_DEPLOY_DATA_DIR') ? OJAS_DEPLOY_DATA_DIR : (getenv('OJAS_DATA_DIR') ?: ''));
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: null;
    if (!$path || !$root || $path === $root || str_starts_with($path, $root . DIRECTORY_SEPARATOR) || !is_dir($path) || !is_writable($path)) {
        throw new RuntimeException('Private storage is not configured');
    }
    return $path;
}

function store(string $name, ?callable $change = null): array {
    if (!preg_match('/\A[a-z0-9_-]+\z/', $name)) throw new RuntimeException('Invalid store');
    $path = data_dir() . '/' . $name . '.json';
    umask(0077);
    $lock = fopen($path . '.lock', 'c');
    if (!$lock) throw new RuntimeException('Lock unavailable');
    $tmp = null;
    try {
        if (!flock($lock, $change ? LOCK_EX : LOCK_SH)) throw new RuntimeException('Lock failed');
        $record = is_file($path)
            ? json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR)
            : ['version'=>1, 'items'=>[]];
        if (($record['version'] ?? null) !== 1 || !is_array($record['items'] ?? null)) throw new RuntimeException('Invalid storage format');
        if ($change) {
            $record['items'] = $change($record['items']);
            $tmp = tempnam(dirname($path), '.write-');
            if ($tmp === false) throw new RuntimeException('Temporary file failed');
            $json = json_encode($record, JSON_THROW_ON_ERROR);
            if (file_put_contents($tmp, $json) !== strlen($json) || !rename($tmp, $path)) throw new RuntimeException('Save failed');
            $tmp = null;
        }
        return $record['items'];
    } finally {
        if (is_string($tmp) && is_file($tmp)) unlink($tmp);
        fclose($lock);
    }
}
