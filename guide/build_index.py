"""Build a portable guide from verified screenshots and terminal transcripts."""
import base64
from html import escape
from pathlib import Path

GUIDE = Path(__file__).resolve().parent
SHOTS = GUIDE / 'screenshots' / 'listener'
TEXT = GUIDE / 'transcripts' / 'listener'
SECTIONS = {
    'Listen to a session': ['01-presets','02-link','03-activity'],
    'Shape the music': ['04-mix','05-inventory','06-rules','07-settings','08-finish'],
    'Earlier terminal player': ['09-cli'],
}
CAPTIONS = {
    '01-presets': ('Choose a starting sound','Pick Classical, Electronic or Hyperpop. Each preset remembers its own settings.'),
    '02-link': ('Link all Codex sessions','Turn on Link all Codex. The link stays ready while sessions are idle. The next working session starts the bass.'),
    '03-activity': ('Follow a read, edit and command','The Activity list identifies each action and its source session. In this guide capture, a seeded file read adds keys, an edit adds chords and a command adds a groove.'),
    '04-mix': ('Hold a bass melody and mix the layers','Choose Undertow and Hold selected melody to keep one line underneath the action. A playing session picks up the change at the next four-bar boundary. Use the channel sliders to balance the parts.'),
    '05-inventory': ('Explore the variation inventory','Compare the ten bass lines and see what each action can play. Steady uses one version, Subtle uses two and Evolving uses three.'),
    '06-rules': ('Give each action a musical role','Choose a part and instrument for each action. Length controls how many bars it plays while work continues. Set Read a file to Evolving to hear related phrases on repeated reads.'),
    '07-settings': ('Save or share your settings','Edits save in this browser. Export settings downloads the selected preset as JSON. Import settings restores it, including action rules, bass selection and mixer levels.'),
    '08-finish': ('Hear the end of a turn','When the last session finishes normally, sounding notes fade for up to 0.8 seconds. The link stays ready for the next turn. Disconnect audio switches it off.'),
    '09-cli': ('Use the earlier Turbella player','The optional Python player follows one Turbella session. Install the dependencies from requirements.txt, find the session ID in the local Turbella status output, then pass it to play_live.py with the groove or electronic preset.'),
}

def card(slug):
    title, caption = map(escape,CAPTIONS[slug])
    transcript = TEXT / (slug+'.txt')
    terms = slug+' '+title+' '+caption
    if transcript.exists():
        content = transcript.read_text()
        media = '<details open><summary>Terminal transcript</summary><pre>'+escape(content)+'</pre></details>'
        terms += ' '+content
    else:
        encoded = base64.b64encode((SHOTS / (slug+'.png')).read_bytes()).decode()
        media = f'<button class="shot" aria-label="Enlarge {title}"><img alt="{title}" src="data:image/png;base64,{encoded}"></button>'
    return f'<article id="{slug}" data-search="{escape(terms.lower(),quote=True)}"><h3>{title}</h3><p>{caption}</p>{media}</article>'

toc = []
sections = []
for i,(title,slugs) in enumerate(SECTIONS.items()):
    toc.append(f'<a href="#section-{i}">{title}</a>')
    sections.append(f'<section id="section-{i}"><h2>{title}</h2>'+''.join(map(card,slugs))+'</section>')
template = (GUIDE / 'template.html').read_text()
(GUIDE / 'index.html').write_text(template.replace('<!-- TOC -->',''.join(toc)).replace('<!-- FEATURES -->',''.join(sections)))
