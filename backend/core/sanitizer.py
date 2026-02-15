"""
Input sanitization for XSS prevention.
"""
import bleach


# Allow basic markdown-compatible tags for post content (plain mode)
ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u", "s", "code", "pre",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote",
    "a", "img",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "width", "height"],
}


# Extended tags for markdown content (richer formatting support)
MARKDOWN_ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u", "s", "code", "pre",
    "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "a", "img", "table", "thead", "tbody",
    "tr", "th", "td", "hr", "span", "div",
]

MARKDOWN_ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "width", "height"],
    "code": ["class"],
    "pre": ["class"],
    "span": ["class"],
    "div": ["class"],
}


def sanitize_text(text: str) -> str:
    """
    Remove all HTML tags from text.
    Used for titles, comments, and other plain text fields.
    """
    if not text:
        return text
    return bleach.clean(text, tags=[], strip=True)


def sanitize_content(content: str) -> str:
    """
    Sanitize post content, allowing safe markdown-compatible HTML.
    """
    if not content:
        return content
    return bleach.clean(
        content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True,
    )


def sanitize_markdown(html: str) -> str:
    """
    Sanitize markdown-rendered HTML content.
    Allows more tags (tables, spans, divs) and class attributes for syntax highlighting.
    """
    if not html:
        return html
    return bleach.clean(
        html,
        tags=MARKDOWN_ALLOWED_TAGS,
        attributes=MARKDOWN_ALLOWED_ATTRS,
        strip=True,
    )
