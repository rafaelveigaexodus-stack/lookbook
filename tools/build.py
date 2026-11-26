"""Monta public/index.html a partir de src/lookbook.html (a mesma fonte do artifact).
Troca os textos que falam do Claude e carrega shim.js antes do app."""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
s = (root / "src" / "lookbook.html").read_text(encoding="utf-8")
REPL = [
    ('"Salvo na sua conta"', '"Salvo neste celular"'),
    ("A IA não está liberada nesta visualização. A nota abaixo usa as regras de cor e estilo do app.", "A IA está fora do ar agora. A nota abaixo usa as regras de cor e estilo do app."),
    ("Sua sessão expirou. Entre de novo no Claude.", "A IA não respondeu agora. Tente de novo em instantes."),
    ("Salvar imagem não está disponível nesta visualização.", "Não deu para salvar a imagem neste aparelho."),
    ("A IA não está disponível nesta visualização, então não dá para sugerir peças agora.", "A IA está fora do ar agora, então não dá para sugerir peças."),
    ('<meta name="claude:viewport-fit-sides" content="cover">', ""),
    # versão sem IA (custo zero)
    ("vários acessórios. A IA completa o que faltar.", "vários acessórios. O app sugere o que combina pelas regras de cor, tecido e estilo."),
    ("Escolha as peças. A IA dá nota para cores, texturas, estilo, proporção e ocasião, e a nota final sai da média. O mesmo look sempre recebe a mesma nota.",
     "Escolha as peças. O app dá a nota pelas regras de cores, texturas e peso dos tecidos, estilo, ocasião e clima. O mesmo look sempre recebe a mesma nota."),
]
for a, b in REPL:
    if a not in s:
        sys.exit(f"texto não encontrado: {a[:60]}")
    s = s.replace(a, b)
head = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#7c3aed">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Lookbook">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-180.png">
<style>[hidden]{display:none!important}body{margin:0}</style>
<script src="config.js"></script>
<script src="shim.js"></script>
"""
i = s.index("<header")
out = head + s[:i] + "</head>\n<body>\n" + s[i:] + "\n</body>\n</html>\n"
(root / "public" / "index.html").write_text(out, encoding="utf-8")
print("public/index.html", len(out))
