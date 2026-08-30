#!/usr/bin/env python3
"""
BOb Simulator — pre-deploy validation.

Run from the repository root:   python3 validate.py

Checks, in order:
  1. Every CSS class referenced in markup or JS has a matching rule
  2. No orphaned CSS rules remain for elements that were removed
  3. Every function called from an inline handler is defined
  4. Specific rules applied by CONTENT, not just class presence

Check 4 exists because two rounds of edits were silently lost when a
multi-edit script aborted part-way. The JavaScript still parsed and the
classes were still referenced; only the rule bodies were missing.

Exits non-zero and names the failing rule. Expected output: VALIDATION CLEAN
"""
import re,sys
s=open('public/dashboard.html',encoding='utf-8').read()
style=re.search(r'<style>(.*?)</style>',s,re.S).group(1)
body=re.sub(r'<style>.*?</style>','',s,flags=re.S)
fail=[]
# every class referenced in markup/JS must have a CSS rule
for cls in ['lp-pair','lp-legend','lp-dot','lp-stem','lp-group',
            'lp-item','lp-lbl','cellable','ros-item','ros-head','ros-body','ros-kv',
            'who-scope','who-pill','ros-search','ros-anon','ros-reveal','ros-contrib',
            'avail-dot','avail-lbl','ros-list','ros-name','ros-chans','ros-ch','ros-caret',
            'ros-assign','ros-hist','ros-mini-hd','ros-dot','ros-sub','ros-count',
            'cfg-subtab-div','scope-chip','scope-note','cfg-hdrow','cfg-saved','cfg-resp-menu','cfg-resp-cancel','acc-head','acc-caret','acc-title','acc-sum','acc-body','edit-btns','edit-save','edit-cancel','del-confirm','del-yes','rule-head','rule-name','rule-meta','cfg-desc','cfg-add-inline','cfg-selrow','ab-item','ab-head','ab-icon','ab-info','ab-label','ab-sub','ab-body','ab-field','ab-chip','ab-vstate','ab-actions','ab-verify','ab-run','ros-kv-cell','ros-kv-n','ros-kv-l','ros-hist-row','ros-hist-t','ros-hist-x','ros-hist-b']:
    if not re.search(r'\.'+re.escape(cls)+r'[\s,{:.]', style):
        fail.append('MISSING CSS: .'+cls)
# no orphan CSS for elements that no longer exist
for cls in ['lp-stem-meca','lp-vals','lp-val','ro-tabs','ro-tab','cfg-add-resp-btn']:
    if re.search(r'\.'+re.escape(cls)+r'[\s,{:.]', style) and cls not in body:
        fail.append('ORPHAN CSS: .'+cls)
# functions referenced from inline handlers must be defined
for fn in set(re.findall(r'onclick="(?:event\.stopPropagation\(\);)?([A-Za-z_$][\w$]*)\(', body))-{'if'}:
    if not re.search(r'function\s+'+re.escape(fn)+r'\s*\(', s):
        fail.append('MISSING FN: '+fn)

# Rule-content assertions — class presence alone let two lost edits pass silently
RULES=[
 ('cell hover underline', r'\.cellable:hover\{[^}]*text-decoration:underline'),
 ('underline hugs text',  r'text-underline-offset:3px'),
 ('stable scroll gutter', r'\.act-body\{[^}]*scrollbar-gutter:stable'),
 ('content cannot shrink', r'\.act-content\{[^}]*flex-shrink:0'),
 ('tab title cannot shrink', r'#actTabTitle\{flex-shrink:0\}'),
 ('desc single line',     r'\.cfg-desc p\{[^}]*white-space:nowrap'),
 ('row yields to cell',   r'\.m-row:has\(\.cellable:hover\)'),
 ('label 13px',           r'\.lp-lbl\{[^}]*font-size:13px'),
 ('pct 13px bold',        r'\.lp-pctlead\{[^}]*font-size:13px[^}]*font-weight:800'),
 ('square outline 2.5px', r'\.lp-dot\.sq\{[^}]*border:2\.5px solid'),
]
for name,pat in RULES:
    if not re.search(pat, style): fail.append('RULE NOT APPLIED: '+name)
JSR=[
 ('per-type AutoBotz fields', r"\['method','Method','select'"),
 ('dynamic field render',     r'function renderABFields'),
 ('AutoBotz picker in use',   r'_autoBotzPicker\('),
 ('sentiment key parser',     r'function _sentKeyParts'),
 ('specific-actor scope',     r"A specific actor"),
 ('scope chain helper',       r"function _scopeChain"),
 ('alarm company-only',       r"respType==='alarm'"),
 ('scoped comm picker',       r"_visibleComms\(mid,r\.type\)"),
 ('scoped botz picker',       r"function _visibleBotz"),
 ('scope select on create',   r"_scopeSelect\('abSC'"),
 ('threshold binds live',     r"commitThreshold\('"),
 ('no save button',           r"^(?!.*Save Configuration</button>)"),
 ('tooltips show sessions',   r"function _lpTip"),
 ('chooser is state-driven',  r"function _respChooser"),
 ('no DOM injection',         r"^(?!.*insertAdjacentHTML)"),
 ('autobotz accordion',       r"function _abFormFields"),
 ('autobotz edit saves',      r"function saveEditAB"),
 ('thresholds accordion',     r"function _thHead"),
 ('cancel reverts',           r"function _snapRestore"),
 ('delete confirmation',      r"function _delRow"),
 ('response save/cancel',     r"function saveResp"),
 ('anomaly resp save/cancel', r"function saveAResp"),
 ('autocomm uses editBtns',   r"_editBtns\(`saveEditCh"),
 ('override storage key',     r"function _thKey"),
 ('override list',            r"function _overrideIds"),
 ('unknown chooser fixed',    r"a:\$\{mid\}:unknown-\$\{sev\}"),
 ('scope-aware options',      r"Unavailable longer than"),
 ('scroll resets on subtab',  r"body\.scrollTop=0"),
 ('new entries prepend',      r"_autoBotz\.unshift"),
 ('no stale ncAB handler',    r"^(?!.*ncAB)"),
 ('four peer sub-tabs',       r"switchConfigSubTab\('autobotz'"),
 ('autobotz destination',     r"function renderAutoBotzCfg"),
 ('inline add buttons',       r"cfg-add-inline"),
 ('buttons name their object',r">\+ Response<"),
 ('no bottom add buttons',    r"^(?!.*cfg-add-resp-btn\" onclick=\"document\.getElementById\('cfgARM')"),
]
for name,pat in JSR:
    if not re.search(pat, s): fail.append('JS NOT APPLIED: '+name)
print('\n'.join(fail) if fail else 'VALIDATION CLEAN')
sys.exit(1 if fail else 0)
