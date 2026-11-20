<?php
return array_map(static fn($item)=>$item['name'], require __DIR__.'/exercise-library.php');
