<?php
// Local XAMPP entry point. Production is served by apps/api.
if (is_file(__DIR__ . '/apps/web/dist/index.html')) {
    header('Location: ./apps/web/dist/', true, 302);
    exit;
}
http_response_code(503);
header('Content-Type: text/plain; charset=utf-8');
echo "CieślaCalc: najpierw uruchom w katalogu projektu:\nnpx pnpm@10.15.1 install\nnpx pnpm@10.15.1 build\n";
