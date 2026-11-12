/* A keyboard-accessible 24-hour clock for the diary's editable time fields. */
(function (D) {
  'use strict';
  let sequence = 0;
  let active;
  let hour;
  const pad = value => String(value).padStart(2, '0');
  const button = (action, text, data = '') => '<button type="button" class="small" data-clock-action="' + action + '"' + data + '>' + text + '</button>';

  function field(name, label, value, escape, icon) {
    const id = 'clock-' + ++sequence;
    return '<div class="time-field"><label for="' + id + '">' + escape(label) + '</label><div class="time-control">' +
      '<input id="' + id + '" name="' + name + '" type="text" value="' + escape(value) +
      '" placeholder="HH:mm" maxlength="5" autocomplete="off">' +
      '<button type="button" class="icon-button" data-clock-action="open" aria-expanded="false" aria-controls="' + id +
      '-picker" aria-label="Clock for ' + escape(label.toLowerCase()) + '" title="Choose time">' + icon + '</button></div>' +
      '<div class="clock-picker" id="' + id + '-picker" role="group" aria-label="24-hour clock" hidden></div></div>';
  }

  function drawHours() {
    const afternoon = hour >= 12;
    const dial = active.querySelector('.clock-dial');
    dial.style.setProperty('--clock-hand-angle', hour % 12 * 30 + 'deg');
    dial.innerHTML = Array.from({ length: 12 }, (_, index) => {
      const value = (afternoon ? 12 : 0) + index;
      return button('hour', pad(value), ' data-hour="' + value + '" aria-pressed="' + (value === hour) + '"');
    }).join('');
    for (const half of active.querySelectorAll('[data-half]')) half.setAttribute('aria-pressed', String((half.dataset.half === '12') === afternoon));
    active.querySelector('.clock-hour').textContent = pad(hour);
  }

  function close(restore = false) {
    if (!active) return;
    const opener = active.querySelector('[data-clock-action="open"]');
    active.querySelector('.clock-picker').hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    if (restore) opener.focus({ preventScroll: true });
    active = null;
  }

  function open(field) {
    if (active === field) { close(true); return; }
    close();
    active = field;
    const value = field.querySelector('input').value.trim();
    const [h, minute] = (D.timePattern.test(value) ? value : D.parts().time).split(':');
    hour = Number(h);
    const picker = field.querySelector('.clock-picker');
    picker.innerHTML = '<div class="actions" aria-label="Hour range">' + button('half', '00–11', ' data-half="0"') +
      button('half', '12–23', ' data-half="12"') + '</div><div class="clock-dial" aria-label="Hour"></div>' +
      '<div class="clock-minute-row"><output class="clock-hour"></output><label>Minute<select aria-label="Minute">' +
      Array.from({ length: 60 }, (_, index) => '<option' + (pad(index) === minute ? ' selected' : '') + '>' + pad(index) + '</option>').join('') +
      '</select></label></div><div class="actions">' + button('apply', 'Set time') + button('clear', 'Clear') + button('cancel', 'Cancel') + '</div>';
    drawHours();
    picker.hidden = false;
    field.querySelector('[data-clock-action="open"]').setAttribute('aria-expanded', 'true');
    field.querySelector('[data-hour][aria-pressed="true"]').focus();
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-clock-action]');
    if (!control) {
      if (active && !active.contains(event.target)) close();
      return;
    }
    const action = control.dataset.clockAction;
    if (action === 'open') { open(control.closest('.time-field')); return; }
    if (!active?.contains(control)) return;
    if (action === 'cancel') { close(true); return; }
    if (action === 'half' || action === 'hour') {
      hour = action === 'half' ? hour % 12 + Number(control.dataset.half) : Number(control.dataset.hour);
      drawHours();
      if (action === 'hour') active.querySelector('[data-hour][aria-pressed="true"]').focus();
      return;
    }
    const input = active.querySelector('input');
    input.value = action === 'clear' ? '' : pad(hour) + ':' + active.querySelector('select').value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active?.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }, true);

  D.clock = { field };
})(Diary);
