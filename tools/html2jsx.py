#!/usr/bin/env python3
"""Convert captured rendered DOM (Tailwind) to JSX.
Usage: html2jsx.py <captured.html> <mode> [out]
  mode: header | footer | main   (extracts that section; main keeps <main> wrapper off -> returns inner)
Writes JSX to stdout or file.
"""
import sys, re, html as htmlmod
from html.parser import HTMLParser

VOID = {
    "area","base","br","col","embed","hr","img","input","link","meta",
    "param","source","track","wbr",
    # svg shapes (unclosed in captured html)
    "path","circle","rect","line","polyline","polygon","ellipse","stop","use",
}

ATTR_RENAME = {
    "class": "className",
    "for": "htmlFor",
    "tabindex": "tabIndex",
    "readonly": "readOnly",
    "maxlength": "maxLength",
    "minlength": "minLength",
    "srcset": "srcSet",
    "crossorigin": "crossOrigin",
    "charset": "charSet",
    "http-equiv": "httpEquiv",
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "fill-rule": "fillRule",
    "fill-opacity": "fillOpacity",
    "stroke-opacity": "strokeOpacity",
    "clip-rule": "clipRule",
    "clip-path": "clipPath",
    "stroke-dasharray": "strokeDasharray",
    "stroke-dashoffset": "strokeDashoffset",
    "xlink:href": "xlinkHref",
    "viewbox": "viewBox",
    "preserveaspectratio": "preserveAspectRatio",
}

NOOP_STYLES = {("opacity", "1"), ("transform", "none")}

def camel(k: str) -> str:
    return re.sub(r"-([a-z])", lambda m: m.group(1).upper(), k)

def style_to_jsx(style: str) -> str | None:
    decls = []
    for part in style.split(";"):
        part = part.strip()
        if not part or ":" not in part:
            continue
        k, v = part.split(":", 1)
        k, v = k.strip(), v.strip()
        if (k, v) in NOOP_STYLES or not v:
            continue
        q = "'" if '"' not in v else '"'
        if q == '"':
            v = v.replace('"', "'")
        decls.append(f"{camel(k)}: {q}{v}{q}")
    if not decls:
        return None
    return "style={{" + ", ".join(decls) + "}}"

def escape_text(t: str) -> str:
    # t is already entity-unescaped by the parser; re-escape for JSX
    t = t.replace("&", "&amp;")
    t = t.replace("<", "&lt;")
    t = t.replace(">", "&gt;")
    t = t.replace("{", "&#123;")
    t = t.replace("}", "&#125;")
    t = t.replace('"', "&quot;")
    t = t.replace("'", "&apos;")
    return t

class Emitter(HTMLParser):
    def __init__(self, pretty: bool = True):
        super().__init__(convert_charrefs=True)
        self.lines: list[str] = []
        self.depth = 0
        self.pretty = pretty
        self._in_style = False
        self._style_buf: list[str] = []

    def _emit(self, s: str):
        if self.pretty:
            self.lines.append("  " * self.depth + s)
        else:
            self.lines.append(s)

    def _attrs(self, attrs):
        parts = []
        for k, v in attrs:
            if k == "style":
                sx = style_to_jsx(v or "")
                if sx:
                    parts.append(sx)
                continue
            nk = ATTR_RENAME.get(k, k)
            if v is None:
                parts.append(nk)
            else:
                v = v.replace('"', "&quot;")
                parts.append(f'{nk}="{v}"')
        return (" " + " ".join(parts)) if parts else ""

    def handle_starttag(self, tag, attrs):
        if tag == "style":
            self._in_style = True
            self._style_buf = []
            return
        a = self._attrs(attrs)
        if tag in VOID:
            self._emit(f"<{tag}{a} />")
        else:
            self._emit(f"<{tag}{a}>")
            self.depth += 1

    def handle_startendtag(self, tag, attrs):
        self._emit(f"<{tag}{self._attrs(attrs)} />")

    def handle_endtag(self, tag):
        if tag == "style":
            css = "".join(self._style_buf).replace("`", "\\`").replace("${", "\\${")
            self._in_style = False
            self._emit("<style dangerouslySetInnerHTML={{ __html: `" + css + "` }} />")
            return
        if tag not in VOID:
            self.depth = max(0, self.depth - 1)
            self._emit(f"</{tag}>")

    def handle_data(self, data):
        if self._in_style:
            self._style_buf.append(data)
            return
        if not data.strip():
            return
        # drop whitespace-only text nodes (formatting); JSX collapses anyway
        t = escape_text(re.sub(r"\s+", " ", data))
        prefix = ""
        suffix = ""
        if t[:1] == " ":
            prefix = '{" "}'
            t = t[1:]
        if t[-1:] == " ":
            suffix = '{" "}'
            t = t[:-1]
        self._emit(prefix + t + suffix)

    def handle_comment(self, data):
        pass

    def handle_entityref(self, name):
        self.out.append(f"&{name};")

    def handle_charref(self, name):
        self.out.append(f"&#{name};")

def extract(html: str, mode: str) -> str:
    if mode == "header":
        m = re.search(r"<header>.*?</header>", html, re.S)
    elif mode == "footer":
        m = re.search(r"<footer>.*?</footer>", html, re.S)
    elif mode == "main":
        m = re.search(r"<main>(.*?)</main>", html, re.S)
        return m.group(1) if m else ""
    else:
        raise ValueError(mode)
    return m.group(0) if m else ""

def main():
    src, mode = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else None
    html = open(src, encoding="utf-8").read()
    frag = extract(html, mode)
    em = Emitter()
    em.feed(frag)
    jsx = "\n".join(em.lines) + "\n"
    if out:
        open(out, "w", encoding="utf-8").write(jsx)
    else:
        sys.stdout.write(jsx)

if __name__ == "__main__":
    main()
