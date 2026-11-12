/* Rich note fields keep the existing plain text alongside safe formatting and sketches. */
(function (D) {
  'use strict';

  const fonts = { system: 'System', serif: 'Book serif', sans: 'Clear sans', mono: 'Monospace', hand: 'Handwritten' };
  const sizes = { compact: 'Compact', standard: 'Standard', large: 'Large' };
  const placements = { top: 'Above the stickies', bottom: 'Below the stickies' };
  const tags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'MARK', 'DIV', 'P', 'BR', 'HR']);
  const ignored = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'SVG', 'MATH']);
  const width = 640;
  const height = 220;
  const strokeLimit = 32;
  const pointLimit = 256;
  const stylePrefix = 'note-style-';
  const editors = new WeakMap();
  const escape = value => D.str(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const font = value => Object.hasOwn(fonts, value) ? value : '';
  const size = value => Object.hasOwn(sizes, value) ? value : 'compact';
  const placement = value => Object.hasOwn(placements, value) ? value : 'bottom';

  function cleanHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    function clean(node, depth) {
      if (node.nodeType === 3) return escape(node.data);
      if (node.nodeType !== 1 || ignored.has(node.tagName)) return '';
      if (depth >= 40) return escape(node.textContent);
      const name = node.tagName.toLowerCase();
      if (name === 'hr' || name === 'br') return '<' + name + '>';
      const content = [...node.childNodes].map(child => clean(child, depth + 1)).join('');
      return tags.has(node.tagName) ? '<' + name + '>' + content + '</' + name + '>' : content;
    }
    return [...template.content.childNodes].map(node => clean(node, 0)).join('');
  }

  function readStyle(raw, text) {
    if (typeof raw !== 'string' || !raw || raw.length > 450000) return null;
    try {
      const style = JSON.parse(raw);
      if (!style || style.text !== D.str(text) || typeof style.html !== 'string') return null;
      const strokes = D.list(style.strokes).slice(0, strokeLimit).filter(stroke => Array.isArray(stroke) &&
        stroke.length >= 2 && stroke.length <= pointLimit && stroke.every(point => Array.isArray(point) && point.length === 2 &&
          point.every(Number.isInteger) && point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height));
      return { html: cleanHtml(style.html), font: font(style.font), strokes };
    } catch { return null; }
  }

  function render(text, raw) {
    const style = readStyle(raw, text);
    if (!text && !style) return '';
    const drawing = style?.strokes.length ? '<svg class="notebook-sketch" viewBox="0 0 ' + width + ' ' + height +
      '" role="img" aria-label="Saved note sketch">' + style.strokes.map(stroke => '<polyline points="' +
        stroke.map(point => point.join(',')).join(' ') + '"></polyline>').join('') + '</svg>' : '';
    return '<div class="notebook-view" data-note-font="' + (style?.font || '') + '" dir="auto">' +
      (style?.html || escape(text)) + drawing + '</div>';
  }

  function field(name, label, value, placeholder = '') {
    return '<div class="wide notebook-field" data-notebook-field data-note-label="' + escape(label) + '"><label>' + escape(label) +
      '<textarea name="' + name + '" placeholder="' + escape(placeholder) + '">' + escape(value) + '</textarea></label>' +
      '<button class="small text-button notebook-launch" type="button" data-note-open aria-expanded="false">Format &amp; draw</button>' +
      '<input type="hidden" name="' + stylePrefix + name + '" data-note-style></div>';
  }

  function capture(values, previous) {
    const styles = { ...previous };
    for (const [key, raw] of values) {
      if (!key.startsWith(stylePrefix)) continue;
      const name = key.slice(stylePrefix.length);
      const style = readStyle(raw, values.get(name));
      if (style) styles[name] = JSON.stringify({ ...style, text: values.get(name) });
      else delete styles[name];
    }
    return Object.keys(styles).length ? styles : undefined;
  }

  function mount(root, stored) {
    for (const wrapper of root.querySelectorAll('[data-notebook-field]')) {
      const plain = wrapper.querySelector('textarea');
      const launch = wrapper.querySelector('[data-note-open]');
      const hidden = wrapper.querySelector('[data-note-style]');
      const raw = stored?.[plain.name];
      const style = readStyle(raw, plain.value);
      let editor;
      function open(showTools) {
        editor ||= makeEditor(wrapper, plain, hidden, style);
        editor.tools.hidden = !showTools;
        launch.setAttribute('aria-expanded', String(showTools));
        launch.textContent = showTools ? 'Hide note tools' : 'Format & draw';
        if (showTools) editor.area.focus();
      }
      if (style) {
        hidden.value = raw;
        open(false);
      }
      launch.addEventListener('click', () => open(launch.getAttribute('aria-expanded') === 'false'));
    }
  }

  function makeEditor(wrapper, plain, hidden, style) {
    const box = document.createElement('div');
    box.className = 'notebook-editor';
    box.innerHTML = '<div class="notebook-tools actions" role="group" aria-label="Note formatting">' +
      '<select class="note-font-choice" aria-label="Note font"><option value="">Diary font</option>' +
      Object.entries(fonts).map(([key, label]) => '<option value="' + key + '">' + label + '</option>').join('') + '</select>' +
      '<button type="button" class="small" data-format="strong">Bold</button><button type="button" class="small" data-format="em">Italic</button>' +
      '<button type="button" class="small" data-format="u">Underline</button><button type="button" class="small" data-format="mark">Highlight</button>' +
      '<button type="button" class="small" data-format="hr">Divider</button><button type="button" class="small" data-note-draw aria-expanded="false">Draw</button>' +
      '<button type="button" class="small text-button" data-format="clear">Clear text formatting</button>' +
      '<span class="notebook-hint muted" role="status"></span></div>' +
      '<div class="notebook-writing" role="textbox" aria-multiline="true" contenteditable="true" dir="auto"></div>' +
      '<div class="notebook-drawing" hidden><div class="actions">' +
      '<button type="button" class="small" data-pen="line" aria-pressed="true">Straight line</button>' +
      '<button type="button" class="small" data-pen="free" aria-pressed="false">Freehand</button>' +
      '<button type="button" class="small" data-pen="undo">Undo stroke</button>' +
      '<button type="button" class="small text-button" data-pen="clear">Clear sketch</button></div>' +
      '<canvas width="' + width + '" height="' + height + '" aria-label="Draw with a mouse or touch"></canvas></div>';
    wrapper.append(box);
    plain.hidden = true;
    const area = box.querySelector('.notebook-writing');
    const tools = box.querySelector('.notebook-tools');
    const fontChoice = box.querySelector('.note-font-choice');
    const hint = box.querySelector('.notebook-hint');
    const drawToggle = box.querySelector('[data-note-draw]');
    const drawing = box.querySelector('.notebook-drawing');
    const canvas = drawing.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const strokes = style?.strokes || [];
    let mode = 'line';
    let activeStroke = null;
    let pointer = null;
    let savedRange = null;
    area.setAttribute('aria-label', wrapper.dataset.noteLabel);
    if (style?.html) area.innerHTML = style.html;
    else area.textContent = plain.value;
    fontChoice.value = area.dataset.noteFont = style?.font || '';

    function sync() {
      const html = cleanHtml(area.innerHTML);
      const text = area.innerText.replace(/\r\n?/g, '\n');
      const currentFont = font(fontChoice.value);
      plain.value = text;
      hidden.value = currentFont || strokes.length || /<(?:strong|b|em|i|u|s|mark|hr)>/.test(html)
        ? JSON.stringify({ text, html, font: currentFont, strokes }) : '';
      wrapper.dataset.noteDirty = 'true';
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function selectionRange() {
      const selection = window.getSelection();
      if (selection?.rangeCount && area.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        savedRange = selection.getRangeAt(0).cloneRange();
      }
      if (savedRange && area.contains(savedRange.commonAncestorContainer)) return savedRange.cloneRange();
      const range = document.createRange();
      range.selectNodeContents(area);
      range.collapse(false);
      return range;
    }

    function selectRange(range) {
      area.focus();
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      savedRange = range.cloneRange();
    }

    area.addEventListener('input', () => { selectionRange(); sync(); });
    for (const event of ['pointerup', 'keyup', 'blur']) area.addEventListener(event, selectionRange);
    area.addEventListener('paste', event => {
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain') || '';
      if (!text) return;
      const range = selectionRange();
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selectRange(range);
      sync();
    });
    area.addEventListener('drop', event => event.preventDefault());
    fontChoice.addEventListener('change', () => { area.dataset.noteFont = font(fontChoice.value); sync(); });
    tools.addEventListener('pointerdown', event => {
      if (event.target.closest('[data-format]')) { selectionRange(); event.preventDefault(); }
    });
    tools.addEventListener('click', event => {
      const command = event.target.closest('[data-format]')?.dataset.format;
      if (!command) return;
      hint.textContent = '';
      if (command === 'clear') {
        area.textContent = plain.value;
        fontChoice.value = area.dataset.noteFont = '';
        savedRange = null;
        sync();
        return;
      }
      const range = selectionRange();
      if (range.collapsed && command !== 'hr') {
        hint.textContent = 'Select words in the note first.';
        return;
      }
      const element = document.createElement(command);
      if (command === 'hr') range.collapse(false);
      else element.append(range.extractContents());
      range.insertNode(element);
      if (command === 'hr') { range.setStartAfter(element); range.collapse(true); }
      else range.selectNodeContents(element);
      selectRange(range);
      sync();
    });

    function paint() {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#25564b';
      ctx.lineWidth = 2.7;
      ctx.lineCap = ctx.lineJoin = 'round';
      for (const stroke of activeStroke ? [...strokes, activeStroke] : strokes) {
        ctx.beginPath();
        ctx.moveTo(...stroke[0]);
        for (const point of stroke.slice(1)) ctx.lineTo(...point);
        ctx.stroke();
      }
    }
    const showDrawing = open => {
      drawing.hidden = !open;
      drawToggle.setAttribute('aria-expanded', String(open));
      if (open) paint();
    };
    drawToggle.addEventListener('click', () => showDrawing(drawing.hidden));
    if (strokes.length) showDrawing(true);
    drawing.addEventListener('click', event => {
      const pen = event.target.closest('[data-pen]')?.dataset.pen;
      if (pen === 'line' || pen === 'free') {
        mode = pen;
        for (const button of drawing.querySelectorAll('[aria-pressed]')) button.setAttribute('aria-pressed', String(button.dataset.pen === mode));
      } else if (pen === 'undo' || pen === 'clear') {
        if (pen === 'clear') strokes.length = 0;
        else strokes.pop();
        paint();
        sync();
      }
    });
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.round((event.clientX - rect.left) * width / rect.width);
      const y = Math.round((event.clientY - rect.top) * height / rect.height);
      return [Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y))];
    }
    canvas.addEventListener('pointerdown', event => {
      if (pointer !== null || event.button !== 0) return;
      if (strokes.length >= strokeLimit) { hint.textContent = 'Undo or clear a stroke to make room for another.'; return; }
      pointer = event.pointerId;
      activeStroke = [point(event)];
      canvas.setPointerCapture(pointer);
    });
    function extend(event) {
      if (event.pointerId !== pointer) return;
      const next = point(event);
      if (mode === 'line') activeStroke[1] = next;
      else if (activeStroke.length < pointLimit) activeStroke.push(next);
      paint();
    }
    canvas.addEventListener('pointermove', extend);
    canvas.addEventListener('pointerup', event => {
      if (event.pointerId !== pointer) return;
      extend(event);
      strokes.push(activeStroke);
      pointer = activeStroke = null;
      paint();
      sync();
    });
    canvas.addEventListener('pointercancel', event => {
      if (event.pointerId !== pointer) return;
      pointer = activeStroke = null;
      paint();
    });
    editors.set(plain, { area, sync });
    return { area, tools };
  }

  function appendText(field, suffix) {
    if (!field || !suffix) return;
    const editor = editors.get(field);
    if (editor) {
      editor.area.append(document.createTextNode(suffix));
      editor.sync();
    } else field.value += suffix;
  }

  const hasDraft = root => !!root.querySelector('[data-note-dirty="true"]');
  D.notebook = { fonts, sizes, placements, font, size, placement, field, mount, capture, render, appendText, hasDraft };
})(Diary);
