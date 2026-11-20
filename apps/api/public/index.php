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
function body(int $limit=65536): array {
    if (strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') respond(415,['error'=>'JSON required']);
    $raw=file_get_contents('php://input',false,null,0,$limit+1);
    if (strlen($raw)>$limit) respond(413,['error'=>'Request too large']);
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
    $plan=['name'=>$name,'exercises'=>$exercises];
    $targets=$x['targets'] ?? [];
    if (!is_array($targets) || count($targets)>count($exercises)) respond(422,['error'=>'Invalid exercise targets']);
    foreach ($targets as $id=>$target) {
        if (!in_array($id,$exercises,true) || !is_array($target)) respond(422,['error'=>'Target must match a plan exercise']);
    }
    // Normalize by exercise order so reordered JSON keys do not affect retry fingerprints.
    foreach ($exercises as $id) {
        if (!isset($targets[$id])) continue;
        $item=$targets[$id];
        $sets=$item['sets'] ?? null; $reps=$item['reps'] ?? null; $rest=$item['restSeconds'] ?? null;
        if (!is_int($sets) || $sets<1 || $sets>20 || !is_int($reps) || $reps<1 || $reps>300
            || !is_int($rest) || $rest<0 || $rest>900) respond(422,['error'=>'Targets must be 1–20 sets, 1–300 reps, and 0–900 seconds of rest']);
        $plan['targets'][$id]=['sets'=>$sets,'reps'=>$reps,'restSeconds'=>$rest];
        if (isset($item['repCeiling'])) {
            $top=$item['repCeiling'];
            if (!is_int($top)||$top<=$reps||$top>300) respond(422,['error'=>'Upper rep target must exceed the base rep target']);
            $plan['targets'][$id]['repCeiling']=$top;
        }
        if (isset($item['deloadAfter'])) {
            $limit=$item['deloadAfter'];
            if (!is_int($limit)||$limit<2||$limit>6) respond(422,['error'=>'Deload threshold must be 2–6 sessions']);
            $plan['targets'][$id]['deloadAfter']=$limit;
        }
        if (isset($item['group'])) {
            if (!is_string($item['group']) || !preg_match('/^[A-Z]$/D',$item['group'])) respond(422,['error'=>'Invalid superset letter']);
            $plan['targets'][$id]['group']=$item['group'];
        }
        if (isset($item['backup'])) {
            $backup=$item['backup'];
            if (!is_string($backup) || !isset($catalog[$backup]) || in_array($backup,$exercises,true))
                respond(422,['error'=>'Backup must be an exercise outside this routine']);
            $plan['targets'][$id]['backup']=$backup;
        }
    }
    return $plan;
}
function workout_sets(mixed $sets, array $plan): array {
        if (!is_array($sets) || !array_is_list($sets) || count($sets)<1 || count($sets)>120) respond(422,['error'=>'Log 1–120 sets']);
        $clean=[];
        foreach ($sets as $s) {
            if (!is_array($s)) respond(422,['error'=>'Invalid set']);
            $e=$s['exercise'] ?? null; $w=$s['kg'] ?? null; $n=$s['reps'] ?? null;
            $kind=$s['kind'] ?? 'work';
            if (!in_array($e,$plan['exercises'],true) || !in_array($kind,['work','warmup','drop','timed','cardio'],true))
                respond(422,['error'=>'Invalid exercise or set type']);
            $time=in_array($kind,['timed','cardio'],true);
            if (!(is_int($w)||is_float($w)) || !is_finite($w) || $w<0 || $w>1000 || !is_int($n) || $n<($time?0:1) || $n>300)
                respond(422,['error'=>'Invalid weight or reps']);
            $row=['exercise'=>$e,'kg'=>(float)$w,'reps'=>$n];
            if ($kind!=='work') $row['kind']=$kind;
            if ($time) {
                $seconds=$s['seconds'] ?? null;
                if (!is_int($seconds) || $seconds<1 || $seconds>86400 || $w!=0 || $n!==0)
                    respond(422,['error'=>'Timed and cardio entries require 1–86,400 seconds and no load or reps']);
                $row['seconds']=$seconds;
                if ($kind==='cardio' && isset($s['km'])) {
                    $km=$s['km'];
                    if (!(is_int($km)||is_float($km)) || !is_finite($km) || $km<=0 || $km>1000) respond(422,['error'=>'Invalid cardio distance']);
                    $row['km']=(float)$km;
                }
            }
            foreach (['rpe'=>[1,10],'rir'=>[0,10],'restSeconds'=>[0,900]] as $field=>[$min,$max]) {
                if (!isset($s[$field])) continue;
                $value=$s[$field];
                if (!is_int($value) || $value<$min || $value>$max) respond(422,['error'=>'Invalid '.$field]);
                $row[$field]=$value;
            }
            if (isset($row['rpe'],$row['rir'])) respond(422,['error'=>'Enter RPE or RIR, not both']);
            if (isset($s['group'])) {
                if (!is_string($s['group']) || !preg_match('/^[A-Z]$/D',$s['group'])) respond(422,['error'=>'Use a single letter for a superset group']);
                $row['group']=$s['group'];
            }
            $clean[]=$row;
        }
    return $clean;
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
    $demoEnabled = defined('OJAS_STAGING_DEMO') && OJAS_STAGING_DEMO;
    if (!empty($_SESSION['user']['demo']) && (!$demoEnabled || ($_SESSION['demoUntil'] ?? 0) <= time())) {
        $_SESSION=[];
        if (!session_regenerate_id(true)) throw new RuntimeException('Session reset failed');
    }
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    if ($method==='GET' && $path==='/me') {
        respond(200,['user'=>$_SESSION['user'] ?? null,'csrf'=>$_SESSION['csrf'],'demoAvailable'=>$demoEnabled]);
    }
    if ($method!=='GET' && !hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) respond(403,['error'=>'Refresh your session and try again']);
    if ($method==='POST' && $path==='/auth/demo') {
        if (!$demoEnabled) respond(404,['error'=>'Endpoint not found']);
        if (!empty($_SESSION['user'])) respond(409,['error'=>'Sign out before starting a demo']);
        if (!session_regenerate_id(true)) throw new RuntimeException('Session reset failed');
        $_SESSION=[
            'user'=>['id'=>'demo_'.bin2hex(random_bytes(16)), 'demo'=>true],
            'csrf'=>bin2hex(random_bytes(32)),
            'demoUntil'=>time()+1800,
            'demoData'=>['routines'=>[], 'workouts'=>[]],
        ];
        respond(200,['user'=>$_SESSION['user'],'csrf'=>$_SESSION['csrf'],'demoAvailable'=>true]);
    }
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
    if ($method==='POST' && $path==='/auth/pair/redeem') {
        if (!empty($_SESSION['user'])) respond(409,['error'=>'Sign out before pairing']);
        $token=body()['token'] ?? null;
        if (!is_string($token) || !preg_match('/^[0-9a-f]{48}$/D',$token)) respond(422,['error'=>'Invalid pairing code']);
        $key=hash('sha256',$token);
        $paired=null;
        store('pairings',static function($items) use($key,&$paired){
            $row=$items[$key] ?? null;
            if (!$row || $row['expires']<=time()) respond(401,['error'=>'Pairing code expired or already used']);
            $paired=$row['user'];
            unset($items[$key]);
            return $items;
        });
        if (!session_regenerate_id(true)) throw new RuntimeException('Session reset failed');
        $_SESSION=['user'=>$paired,'csrf'=>bin2hex(random_bytes(32))];
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
    $isDemo=!empty($user['demo']);
    if (!$isDemo) session_write_close();
    if ($method==='POST' && $path==='/auth/pair/create') {
        if ($isDemo) respond(403,['error'=>'Pairing is unavailable in the demo']);
        $token=bin2hex(random_bytes(24));
        $expires=time()+300;
        store('pairings',static function($items) use($user,$token,$expires){
            $items=array_filter($items,static fn($row)=>$row['expires']>time() && $row['user']['id']!==$user['id']);
            $items[hash('sha256',$token)]=['user'=>$user,'expires'=>$expires];
            return $items;
        });
        respond(201,['token'=>$token,'expiresAt'=>gmdate(DATE_ATOM,$expires)]);
    }
    $userStore=static function (?callable $change=null) use ($user,$isDemo): array {
        if (!$isDemo) return store('user_'.$user['id'],$change);
        $data=$_SESSION['demoData'];
        if ($change) {
            $data=$change($data);
            if (count($data['routines'])>10 || count($data['workouts'])>20) respond(422,['error'=>'Demo storage limit reached. Sign out to start a fresh demo.']);
            $_SESSION['demoData']=$data;
        }
        return $data;
    };
    // Built-in templates remain usable without prescriptions.
    $starters=[
        ['id'=>'starter','name'=>'Full Body A','exercises'=>['squat','bench','row']],
        ['id'=>'starter-push','name'=>'Push','exercises'=>['bench','press','pushup']],
        ['id'=>'starter-pull','name'=>'Pull','exercises'=>['row','pulldown','curl']],
        ['id'=>'starter-legs','name'=>'Legs','exercises'=>['squat','deadlift','split']],
        ['id'=>'starter-upper','name'=>'Upper Body','exercises'=>['bench','row','press','pulldown']],
        ['id'=>'starter-lower','name'=>'Lower Body','exercises'=>['squat','deadlift','split']],
        ['id'=>'starter-5x5-a','name'=>'5×5 A','exercises'=>['squat','bench','barbell-row'],
            'targets'=>array_fill_keys(['squat','bench','barbell-row'],['sets'=>5,'reps'=>5,'restSeconds'=>180])],
        ['id'=>'starter-5x5-b','name'=>'5×5 B','exercises'=>['squat','press','deadlift'],
            'targets'=>['squat'=>['sets'=>5,'reps'=>5,'restSeconds'=>180],
                'press'=>['sets'=>5,'reps'=>5,'restSeconds'=>180],
                'deadlift'=>['sets'=>1,'reps'=>5,'restSeconds'=>180]]],
    ];
    if ($path==='/photos' || preg_match('~^/photos/([a-f0-9]{32})$~D',$path,$photoMatch)) {
        if ($isDemo) respond(403,['error'=>'Progress photos are disabled in the staging demo']);
        $photoStore='photos_'.$user['id'];
        if ($method==='GET' && $path==='/photos') {
            $items=array_values(store($photoStore));
            respond(200,['photos'=>array_map(static fn($p)=>['id'=>$p['id'],'createdAt'=>$p['createdAt']],array_reverse($items))]);
        }
        if ($method==='GET' && isset($photoMatch[1])) {
            $photo=store($photoStore)[$photoMatch[1]] ?? null;
            if (!$photo) respond(404,['error'=>'Photo not found']);
            respond(200,['jpeg'=>$photo['jpeg']]);
        }
        if ($method==='DELETE' && isset($photoMatch[1])) {
            store($photoStore,static function($items) use($photoMatch){
                unset($items[$photoMatch[1]]);
                return $items;
            });
            respond(200,['ok'=>true]);
        }
        if ($method==='POST' && $path==='/photos') {
            $x=body(280000);
            $jpeg=$x['jpeg'] ?? null;
            $bytes=is_string($jpeg) ? base64_decode($jpeg,true) : false;
            $info=$bytes!==false && strlen($bytes)<=196608 ? @getimagesizefromstring($bytes) : false;
            if (!$info || $info[2]!==IMAGETYPE_JPEG || max($info[0],$info[1])>1024)
                respond(422,['error'=>'Expected a JPEG up to 1,024 px and 192 KiB']);
            $id=bin2hex(random_bytes(16));
            $createdAt=gmdate(DATE_ATOM);
            store($photoStore,static function($items) use($id,$createdAt,$bytes){
                if (count($items)>=12) respond(422,['error'=>'Delete an older photo before adding another']);
                $items[$id]=['id'=>$id,'createdAt'=>$createdAt,'jpeg'=>base64_encode($bytes)];
                return $items;
            });
            respond(201,['id'=>$id,'createdAt'=>$createdAt]);
        }
    }
    if ($method==='PUT' && $path==='/bodyweight') {
        $x=body();
        $date=$x['date'] ?? null; $kg=$x['kg'] ?? null;
        if (!is_string($date) || !preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D',$date,$parts)
            || !checkdate((int)$parts[2],(int)$parts[3],(int)$parts[1]) || $date<'1900-01-01' || $date>gmdate('Y-m-d')
            || !(is_int($kg)||is_float($kg)) || !is_finite($kg) || $kg<1 || $kg>1000)
            respond(422,['error'=>'Use a valid UTC date and a weight between 1 and 1,000 kg']);
        $d=$userStore(static function($d) use($date,$kg,$isDemo) {
            $d['bodyweight'][$date]=['date'=>$date,'kg'=>round($kg,2)];
            if (count($d['bodyweight'])>($isDemo?30:36600)) respond(422,['error'=>'Weigh-in limit reached']);
            return $d;
        });
        respond(200,['entry'=>$d['bodyweight'][$date]]);
    }
    if ($method==='POST' && $path==='/import') {
        if ($isDemo) respond(403,['error'=>'Import is disabled in the temporary demo']);
        $x=body();
        if (($x['version'] ?? null)!==1) respond(422,['error'=>'Select an OJAS version 1 JSON export']);
        $incoming=[];
        foreach (['routines','workouts','bodyweight'] as $key) {
            $rows=$x[$key] ?? [];
            if (!is_array($rows) || !array_is_list($rows) || count($rows)>500) respond(422,['error'=>'Invalid import list: '.$key]);
            $incoming[$key]=[];
            foreach ($rows as $row) {
                if (!is_array($row)) respond(422,['error'=>'Invalid import entry']);
                $id=$row['id'] ?? null;
                if ($key==='routines') {
                    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D',$id)) respond(422,['error'=>'Invalid routine ID']);
                    $clean=routine($row,$catalog)+['id'=>$id];
                } elseif ($key==='workouts') {
                    $stamp=$row['finishedAt'] ?? null;
                    if (!is_string($id) || !preg_match('/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/D',$id)
                        || !is_string($stamp) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|\+00:00)$/D',$stamp))
                        respond(422,['error'=>'Invalid workout ID or timestamp']);
                    $normalized=substr($stamp,0,19).'+00:00';
                    $dt=DateTimeImmutable::createFromFormat(DATE_ATOM,$normalized);
                    if (!$dt || $dt->format(DATE_ATOM)!==$normalized || $dt->getTimestamp()>time())
                        respond(422,['error'=>'Invalid workout timestamp']);
                    $plan=routine(is_array($row['plan'] ?? null)?$row['plan']:[],$catalog);
                    $payload=['id'=>$id,'plan'=>$plan,'sets'=>workout_sets($row['sets'] ?? null,$plan)];
                    $clean=$payload+['finishedAt'=>$normalized,'revision'=>0,
                        'fingerprint'=>hash('sha256',json_encode($payload,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION))];
                } else {
                    $id=$row['date'] ?? null;
                    $kg=$row['kg'] ?? null;
                    if (!is_string($id) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$id,$parts)
                        || !checkdate((int)$parts[2],(int)$parts[3],(int)$parts[1]) || $id<'1900-01-01' || $id>gmdate('Y-m-d')
                        || !(is_int($kg)||is_float($kg)) || !is_finite($kg) || $kg<1 || $kg>1000)
                        respond(422,['error'=>'Invalid bodyweight entry']);
                    $clean=['date'=>$id,'kg'=>round($kg,2)];
                }
                if (isset($incoming[$key][$id])) respond(422,['error'=>'Duplicate entry in import file']);
                $incoming[$key][$id]=$clean;
            }
        }
        $added=0; $skipped=0;
        $userStore(static function($d) use($incoming,&$added,&$skipped) {
            foreach ($incoming as $key=>$entries) foreach ($entries as $id=>$entry) {
                if (isset($d[$key][$id])) { $skipped++; continue; }
                $d[$key][$id]=$entry; $added++;
            }
            if (count($d['bodyweight'] ?? [])>36600) respond(422,['error'=>'Weigh-in limit reached']);
            return $d;
        });
        respond(200,['added'=>$added,'skipped'=>$skipped]);
    }
    if ($method==='GET' && $path==='/export') {
        $d=$userStore();
        $workouts=array_values($d['workouts'] ?? []);
        foreach ($workouts as &$workout) unset($workout['fingerprint'],$workout['rotation']);
        unset($workout);
        respond(200,['version'=>1,'exportedAt'=>gmdate(DATE_ATOM),'routines'=>array_values($d['routines'] ?? []),
            'workouts'=>$workouts,'bodyweight'=>array_values($d['bodyweight'] ?? []),'schedule'=>$d['schedule'] ?? null]);
    }
    if ($method==='GET' && $path==='/schedule') {
        respond(200,['schedule'=>$userStore()['schedule'] ?? null]);
    }
    if ($method==='PUT' && $path==='/schedule') {
        $x=body();
        $mode=$x['mode'] ?? null;
        $slots=$x['slots'] ?? null;
        if (!in_array($mode,['manual','weekly','rotation'],true) || !is_array($slots) || !array_is_list($slots)
            || ($mode==='manual' && count($slots)!==0) || ($mode==='weekly' && count($slots)!==7)
            || ($mode==='rotation' && (count($slots)<1 || count($slots)>12)))
            respond(422,['error'=>'Invalid schedule']);
        $d=$userStore(static function($d) use ($mode,$slots,$starters) {
            $ids=array_merge(array_column($starters,'id'),array_keys($d['routines'] ?? []));
            foreach ($slots as $slot) {
                if ($slot===null && $mode==='weekly') continue;
                if (!is_string($slot) || !in_array($slot,$ids,true)) respond(422,['error'=>'Choose an available routine']);
            }
            $previous=$d['schedule'] ?? null;
            if (($previous['mode'] ?? null)===$mode && $previous['slots']===$slots) return $d;
            $d['schedule']=['mode'=>$mode,'slots'=>$slots,'id'=>bin2hex(random_bytes(16)),'step'=>0];
            return $d;
        });
        respond(200,['schedule'=>$d['schedule']]);
    }
    if ($method==='GET' && $path==='/exercises') respond(200,['exercises'=>$catalog,'library'=>require __DIR__.'/../exercise-library.php']);
    if ($method==='GET' && $path==='/routines') respond(200,['routines'=>array_merge($starters,array_values($userStore()['routines'] ?? []))]);
    if (($method==='POST' && $path==='/routines') || ($method==='PATCH' && preg_match('~^/routines/([a-f0-9]{32})$~D',$path,$match))) {
        $new=routine(body(),$catalog);
        $new['id']=$match[1] ?? bin2hex(random_bytes(16));
        $userStore(function($d) use ($new,$method) {
            if ($method==='PATCH' && !isset($d['routines'][$new['id']])) respond(404,['error'=>'Plan not found']);
            $d['routines'][$new['id']]=$new;
            return $d;
        });
        respond($method==='POST'?201:200,['routine'=>$new]);
    }
    if ($method==='GET' && in_array($path,['/workouts','/progress'],true)) {
        $d=$userStore();
        $sessions=array_values($d['workouts'] ?? []);
        usort($sessions,static fn($a,$b)=>strcmp($b['finishedAt'],$a['finishedAt']));
        respond(200,['workouts'=>$sessions,'bodyweight'=>array_values($d['bodyweight'] ?? [])]);
    }
    if ($method==='PATCH' && preg_match('~^/workouts/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$~D',$path,$match)) {
        $id=$match[1];
        $x=body();
        $date=$x['date'] ?? null;
        $revision=$x['revision'] ?? null;
        if (!is_string($date) || !preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D',$date,$parts)
            || !checkdate((int)$parts[2],(int)$parts[3],(int)$parts[1])
            || $date<'1900-01-01' || $date>gmdate('Y-m-d') || !is_int($revision) || $revision<0)
            respond(422,['error'=>'Use a valid UTC workout date and revision']);
        $d=$userStore(static function($d) use($id,$x,$date,$revision) {
            $w=$d['workouts'][$id] ?? null;
            if (!$w) respond(404,['error'=>'Workout not found']);
            if (($w['revision'] ?? 0)!==$revision) respond(409,['error'=>'Workout changed. Reopen it before editing.']);
            $w['sets']=workout_sets($x['sets'] ?? null,$w['plan']);
            $w['finishedAt']=$date.substr($w['finishedAt'],10);
            $w['revision']=$revision+1;
            $d['workouts'][$id]=$w;
            return $d;
        });
        respond(200,['workout'=>$d['workouts'][$id]]);
    }
    if ($method==='POST' && $path==='/workouts') {
        $x=body();
        $id=$x['id'] ?? null;
        if (!is_string($id) || !preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/',$id)) respond(422,['error'=>'Invalid workout ID']);
        $plan=is_array($x['plan'] ?? null) ? routine($x['plan'],$catalog) : routine([],$catalog);
        $clean=workout_sets($x['sets'] ?? null,$plan);
        $payload=['id'=>$id,'plan'=>$plan,'sets'=>$clean];
        if (array_key_exists('rotation',$x)) {
            $rotation=$x['rotation'];
            if (!is_array($rotation) || !is_string($rotation['id'] ?? null) || !preg_match('/^[a-f0-9]{32}$/D',$rotation['id'])
                || !is_int($rotation['step'] ?? null) || $rotation['step']<0
                || !is_string($rotation['planId'] ?? null) || strlen($rotation['planId'])>32) respond(422,['error'=>'Invalid rotation reference']);
            $payload['rotation']=['id'=>$rotation['id'],'step'=>$rotation['step'],'planId'=>$rotation['planId']];
        }
        $fingerprint=hash('sha256',json_encode($payload,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION));
        $status=201;
        $d=$userStore(function($d) use($id,$payload,$fingerprint,&$status) {
            if (isset($d['workouts'][$id])) {
                if ($d['workouts'][$id]['fingerprint']!==$fingerprint) respond(409,['error'=>'This workout ID already has different sets']);
                $status=200;
            } else {
                $rotation=$payload['rotation'] ?? null;
                $schedule=$d['schedule'] ?? null;
                if ($rotation && ($schedule['mode'] ?? null)==='rotation' && $schedule['id']===$rotation['id']
                    && $schedule['step']===$rotation['step'] && $schedule['slots'][$schedule['step'] % count($schedule['slots'])]===$rotation['planId']) {
                    $d['schedule']['step']++;
                }
                $d['workouts'][$id]=$payload+['finishedAt'=>gmdate(DATE_ATOM),'fingerprint'=>$fingerprint];
            }
            return $d;
        });
        respond($status,['workout'=>$d['workouts'][$id],'schedule'=>$d['schedule'] ?? null]);
    }
    respond(404,['error'=>'Endpoint not found']);
} catch (Throwable $e) {
    error_log('OJAS '.get_class($e).': '.$e->getMessage());
    respond(503,['error'=>'Service unavailable']);
}
