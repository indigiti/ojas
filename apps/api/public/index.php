<?php
declare(strict_types=1);
require dirname(__DIR__).'/storage.php';
$catalog = require dirname(__DIR__).'/catalog.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(int $status, array $result): never {
    http_response_code($status);
    echo json_encode($result, JSON_THROW_ON_ERROR);
    exit;
}
function body(): array {
    if (strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') respond(415,['error'=>'JSON required']);
    $raw=file_get_contents('php://input',false,null,0,65537);
    if (strlen($raw)>65536) respond(413,['error'=>'Request too large']);
    try { $parsed=json_decode($raw,true,32,JSON_THROW_ON_ERROR); }
    catch (JsonException) { respond(400,['error'=>'Invalid JSON']); }
    if (!is_array($parsed)) respond(400,['error'=>'Invalid request']);
    return $parsed;
}
function routine(array $x, array $catalog): array {
    $name = is_string($x['name'] ?? null) ? trim($x['name']) : '';
    $exercises = $x['exercises'] ?? null;
    if ($name==='' || strlen($name)>100 || !is_array($exercises) || !array_is_list($exercises) || count($exercises)<1 || count($exercises)>12)
        respond(422,['error'=>'Enter a plan name and 1–12 exercises']);
    foreach ($exercises as $e) if (!is_string($e) || !isset($catalog[$e])) respond(422,['error'=>'Unknown exercise']);
    if (count(array_unique($exercises)) !== count($exercises)) respond(422,['error'=>'Duplicate exercise']);
    return ['name'=>$name,'exercises'=>$exercises];
}
try {
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $base = defined('OJAS_DEPLOY_API_PREFIX') ? OJAS_DEPLOY_API_PREFIX : rtrim(getenv('OJAS_API_PREFIX') ?: '/api/v1','/');
    $path = defined('OJAS_DEPLOY_API_ROUTE') ? OJAS_DEPLOY_API_ROUTE : (is_string($uri) && str_starts_with($uri,$base.'/') ? substr($uri,strlen($base)) : '');
    $method=$_SERVER['REQUEST_METHOD'];
    if ($path==='/health' && in_array($method,['GET','HEAD'],true)) { data_dir(); respond(200,['ok'=>true]); }
    $local = !defined('OJAS_DEPLOY_API_PREFIX') && getenv('OJAS_LOCAL_HTTP')==='1' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'], true);
    ini_set('session.use_strict_mode','1');
    ini_set('session.use_only_cookies','1');
    session_name($local ? 'ojas_local' : '__Secure-ojas');
    session_set_cookie_params(['path'=>$base.'/','secure'=>!$local,'httponly'=>true,'samesite'=>'Strict']);
    if (!session_start()) throw new RuntimeException('Session unavailable');
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    if ($method==='GET' && $path==='/me') {
        respond(200,['user'=>$_SESSION['user'] ?? null,'csrf'=>$_SESSION['csrf']]);
    }
    if ($method!=='GET' && !hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) respond(403,['error'=>'Refresh your session and try again']);
    if ($method==='POST' && $path==='/auth/login') {
        $x=body();
        $email=is_string($x['email'] ?? null) ? strtolower(trim($x['email'])) : '';
        $password=$x['password'] ?? null;
        if (strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL) || !is_string($password) || strlen($password)>128) respond(422,['error'=>'Enter valid credentials']);
        $keys=['account:'.hash('sha256',$email),'ip:'.hash('sha256',$_SERVER['REMOTE_ADDR'] ?? '')];
        store('throttle', function($items) use ($keys) {
            $now=time();
            $items=array_filter($items,fn($row)=>$row['until']>$now);
            foreach ($keys as $i=>$key) if (($items[$key]['count'] ?? 0)>=($i===0?8:30)) respond(429,['error'=>'Too many attempts; retry later']);
            foreach ($keys as $key) {
                $items[$key] ??= ['count'=>0,'until'=>$now+900];
                $items[$key]['count']++;
            }
            return $items;
        });
        $account=store('users')[$email] ?? null;
        $ok=password_verify($password,$account['hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        if (!$ok || !$account) respond(401,['error'=>'Invalid email or password']);
        session_regenerate_id(true);
        $_SESSION=['user'=>['id'=>$account['id'],'email'=>$email],'csrf'=>bin2hex(random_bytes(32))];
        respond(200,$_SESSION);
    }
    $user=$_SESSION['user'] ?? null;
    if (!$user) respond(401,['error'=>'Sign in required']);
    if ($method==='POST' && $path==='/auth/logout') {
        $_SESSION=[];
        session_destroy();
        setcookie(session_name(),'', ['expires'=>1,'path'=>$base.'/','secure'=>!$local,'httponly'=>true,'samesite'=>'Strict']);
        respond(200,['ok'=>true]);
    }
    session_write_close();
    $key='user_'.$user['id'];
    $starter=['id'=>'starter','name'=>'Full Body A','exercises'=>['squat','bench','row']];
    if ($method==='GET' && $path==='/exercises') respond(200,['exercises'=>$catalog]);
    if ($method==='GET' && $path==='/routines') respond(200,['routines'=>array_merge([$starter],array_values(store($key)['routines'] ?? []))]);
    if (($method==='POST' && $path==='/routines') || ($method==='PATCH' && preg_match('~^/routines/([a-f0-9]{32})$~D',$path,$match))) {
        $new=routine(body(),$catalog);
        $new['id']=$match[1] ?? bin2hex(random_bytes(16));
        store($key,function($d) use ($new,$method) {
            if ($method==='PATCH' && !isset($d['routines'][$new['id']])) respond(404,['error'=>'Plan not found']);
            $d['routines'][$new['id']]=$new;
            return $d;
        });
        respond($method==='POST'?201:200,['routine'=>$new]);
    }
    if ($method==='GET' && in_array($path,['/workouts','/progress'],true)) {
        $sessions=array_reverse(array_values(store($key)['workouts'] ?? []));
        respond(200,['workouts'=>$sessions]);
    }
    if ($method==='POST' && $path==='/workouts') {
        $x=body();
        $id=$x['id'] ?? null;
        if (!is_string($id) || !preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/',$id)) respond(422,['error'=>'Invalid workout ID']);
        $plan=is_array($x['plan'] ?? null) ? routine($x['plan'],$catalog) : routine([],$catalog);
        $sets=$x['sets'] ?? null;
        if (!is_array($sets) || !array_is_list($sets) || count($sets)<1 || count($sets)>120) respond(422,['error'=>'Log 1–120 sets']);
        $clean=[];
        foreach ($sets as $s) {
            $e=$s['exercise'] ?? null; $w=$s['kg'] ?? null; $n=$s['reps'] ?? null;
            if (!in_array($e,$plan['exercises'],true) || !(is_int($w)||is_float($w)) || !is_finite($w) || $w<0 || $w>1000 || !is_int($n) || $n<1 || $n>300)
                respond(422,['error'=>'Invalid exercise, weight or reps']);
            $clean[]=['exercise'=>$e,'kg'=>(float)$w,'reps'=>$n];
        }
        $payload=['id'=>$id,'plan'=>$plan,'sets'=>$clean];
        $fingerprint=hash('sha256',json_encode($payload,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION));
        $status=201;
        $d=store($key,function($d) use($id,$payload,$fingerprint,&$status) {
            if (isset($d['workouts'][$id])) {
                if ($d['workouts'][$id]['fingerprint']!==$fingerprint) respond(409,['error'=>'This workout ID already has different sets']);
                $status=200;
            } else {
                $d['workouts'][$id]=$payload+['finishedAt'=>gmdate(DATE_ATOM),'fingerprint'=>$fingerprint];
            }
            return $d;
        });
        respond($status,['workout'=>$d['workouts'][$id]]);
    }
    respond(404,['error'=>'Endpoint not found']);
} catch (Throwable $e) {
    error_log('OJAS '.get_class($e).': '.$e->getMessage());
    respond(503,['error'=>'Service unavailable']);
}
