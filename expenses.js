/* PKR transactions and monthly budgets. All amounts are integer paisa. */
(function (D) {
  'use strict';
  const defaults = ['Bills', 'Family', 'Groceries', 'Health', 'Meals', 'Other', 'Transport', 'Salary'];
  const types = { expense: 'Expense', income: 'Income' };
  const views = { overview: 'Overview', transactions: 'Transactions', budget: 'Budget', bills: 'Bills' };
  const amount = D.formatMoney;
  const N = D.notebook;
  const amountField = minor => minor == null ? '' : (minor / 100).toFixed(2);

  D.createExpenses = function (ui) {
    const { state, current, now, E, btn, ibtn, chip, empty, page, panel, dateNav, select, input,
      dateInput, readDate, openDialog, render, commit, ask, removeRecord, download } = ui;

    const month = () => state.date.slice(0, 7);
    const monthLabel = key => D.MONTHS[Number(key.slice(-2)) - 1] + ' ' + key.slice(0, 4);

    function categories() {
      const data = current();
      const items = new Map(defaults.map(name => [D.categoryKey(name), name]));
      for (const row of [...data.money, ...data.budgets]) if (row.category && !row.deletedAt) {
        items.set(D.categoryKey(row.category), row.category);
      }
      return [...items.values()].sort((a, b) => a.localeCompare(b));
    }

    function categoryField(value) {
      return input('category', 'Category', value, { placeholder: 'Choose or type a category',
        extra: ' list="expense-categories" maxlength="80"' }) + '<datalist id="expense-categories">' +
        categories().map(label => '<option value="' + E(label) + '"></option>').join('') + '</datalist>';
    }

    function stats(summary) {
      const values = [
        ['Spent', amount(summary.expense), ''],
        ['Income', amount(summary.income), ''],
        ['Recorded balance', amount(summary.net), summary.net < 0 ? 'warn' : ''],
        ['Budget remaining', summary.limit == null ? 'Set a budget' : amount(summary.limit - summary.expense),
          summary.limit != null && summary.expense > summary.limit ? 'warn' : '']
      ];
      return '<div class="metric-strip money-metrics">' + values.map(([label, value, mood]) => '<div class="metric ' + mood +
        '"><span>' + E(label) + '</span><strong>' + E(value) + '</strong></div>').join('') + '</div>';
    }

    function categoryRows(summary, editable = false) {
      const money = value => value === null ? '—' : amount(value);
      if (!summary.categories.length) return empty('No category spending or category budgets this month.');
      return '<div class="table-wrap"><table><thead><tr><th scope="col">Category</th><th scope="col">Spent</th>' +
        '<th scope="col">Budget</th><th scope="col">Remaining</th>' + (editable ? '<th scope="col">Edit budget</th>' : '') +
        '</tr></thead><tbody>' + summary.categories.map(row => {
          const cap = row.budget?.amountMinor ?? null;
          const left = cap === null ? null : cap - row.spent;
          return '<tr><th scope="row">' + E(row.name) + '</th><td>' + E(amount(row.spent)) + '</td><td>' +
            E(money(cap)) + (cap ? usage(row.spent, cap, row.name + ' budget used') : '') +
            '</td><td class="' + (left < 0 ? 'over-budget' : '') + '">' + E(money(left)) + '</td>' +
            (editable ? '<td>' + ibtn(row.budget ? 'edit' : 'plus', (row.budget ? 'Edit ' : 'Set ') + row.name + ' budget',
              'budget-edit', { id: row.budget?.id ?? '', category: row.name }) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }

    function filter(summary) {
      const query = D.tidy(state.moneyQuery).toLocaleLowerCase('en');
      return summary.records.filter(row => (!state.moneyType || row.type === state.moneyType) &&
        (!state.moneyCategory || D.categoryKey(row.category) === state.moneyCategory) &&
        (!query || [row.title, row.category, row.note].join(' ').toLocaleLowerCase('en').includes(query)))
        .sort((a, b) => b.date.localeCompare(a.date) || D.str(b.createdAt).localeCompare(D.str(a.createdAt)));
    }

    function usage(spent, cap, label) {
      const ratio = cap === 0 ? Number(spent > 0) * 100 : Math.round(100 * spent / cap);
      const status = spent > cap ? 'over' : ratio >= 80 ? 'near' : 'within';
      return '<div class="budget-usage" data-budget-status="' + status + '"><progress value="' + Math.min(100, ratio) +
        '" max="100" aria-label="' + E(label) + '"></progress><small>' + E(ratio + '% used') + '</small></div>';
    }

    function transactions(summary) {
      const rows = filter(summary);
      const fields = select('moneyType', 'Type', { '': 'All types', ...types }, state.moneyType) +
        select('moneyCategory', 'Category', { '': 'All categories', ...Object.fromEntries(categories().map(name =>
          [D.categoryKey(name), name])) }, state.moneyCategory) +
        input('moneyQuery', 'Search', state.moneyQuery, { placeholder: 'Description or note' });
      const list = rows.length ? '<div class="rows">' + rows.map(row => '<div class="row money-row"><div class="row-main">' +
        btn(row.title || row.category, 'money-edit', { id: row.id }, { cls: 'row-title' }) +
        '<div class="pills">' + chip(types[row.type], row.type === 'income' ? 'green' : '') + chip(row.category) +
        chip(D.formatDate(row.date)) + (row.billMonth ? chip('Bill · ' + monthLabel(row.billMonth)) : '') + '</div>' + N.render(row.note, row.noteStyles?.note) +
        '</div><strong>' + E((row.type === 'expense' ? '−' : '+') + amount(row.amountMinor)) + '</strong></div>').join('') +
        '</div>' : empty('No transactions match this view.');
      return panel('Transactions', '<form id="money-filter-form" class="toolbar-filter">' +
          fields + '<button type="submit">Apply filters</button>' + btn('Clear', 'money-clear', {}, { cls: 'text-button' }) +
          '</form>' + list, btn('Export CSV', 'money-export', {}, { icon: 'download', cls: 'text-button' }));
    }

    function figures(rows) {
      return '<dl class="money-figures">' + rows.map(([label, value]) => '<div><dt>' + E(label) +
        '</dt><dd' + (value != null && value < 0 ? ' class="late"' : '') + '>' + E(value == null ? '—' : amount(value)) + '</dd></div>').join('') + '</dl>';
    }

    function budgetPage(summary) {
      const data = current();
      const previous = D.addMonths(month() + '-01', -1).slice(0, 7);
      const limits = data.budgets.filter(row => !row.deletedAt);
      const copyable = D.byId(data.financePlans, previous) && !summary.plan || limits.some(row => row.month === previous &&
        !limits.some(other => other.month === month() && D.categoryKey(other.category) === D.categoryKey(row.category)));
      const totals = figures([['Expected income', summary.plan?.expectedIncomeMinor], ['Savings target', summary.plan?.savingsTargetMinor],
        ['Spending plan', summary.spendingPlan], ['Monthly limit', summary.budget?.amountMinor]]);
      const breakdown = figures([['Allocated to categories', summary.allocated],
        ['Still available to allocate', summary.limit == null ? null : summary.limit - summary.allocated],
        ['Budget left after unpaid bills', summary.limit == null ? null : summary.limit - summary.expense - summary.unpaidTotal]]);
      const actions = btn(summary.plan ? 'Edit month plan' : 'Plan income & savings', 'money-plan-edit', {}, { cls: 'small primary' }) +
        btn(summary.budget ? 'Edit monthly limit' : 'Set monthly limit', 'budget-edit', { id: summary.budget?.id ?? '' }, { cls: 'small' }) +
        (copyable ? btn('Copy last month’s budget', 'money-copy-budget', {}, { cls: 'small' }) : '');
      return '<div class="stack">' + panel('Monthly plan', totals +
        (summary.limit == null ? '' : usage(summary.expense, summary.limit, 'Monthly budget used')) + breakdown,
      '<div class="actions">' + actions + '</div>') +
        panel('Category budgets', categoryRows(summary, true), btn('Add category budget', 'budget-edit', { category: '', mode: 'category' },
          { cls: 'small', icon: 'plus' })) + '</div>';
    }

    function billRows(items, compact = false) {
      if (!items.length) return empty(compact ? 'No unpaid bills for this month.' : 'No bills scheduled for this month.');
      return '<div class="rows">' + items.map(({ row, due, paid }) => {
        const timing = paid ? 'Paid ' + D.formatDate(paid.date) : (due < now().date ? 'Overdue ' : 'Due ') + D.formatDate(due);
        const tools = paid ? btn('View payment', 'money-edit', { id: paid.id }, { cls: 'small' }) :
          btn('Log payment', 'bill-pay', { id: row.id }, { cls: 'small primary' }) + btn('Link transaction', 'bill-link', { id: row.id }, { cls: 'small' });
        return '<article class="row money-row"><div class="row-main"><strong>' + E(row.title) + '</strong><small class="' +
          (!paid && due < now().date ? 'late' : 'muted') + '">' + E(timing + ' · ' + row.category) + '</small></div><strong>' +
          E(amount(paid?.amountMinor ?? row.amountMinor)) + '</strong>' + (compact ? '' : '<div class="actions">' + tools +
            (!row.deletedAt ? ibtn('edit', 'Edit ' + row.title, 'bill-edit', { id: row.id }) : '') + '</div>') + '</article>';
      }).join('') + '</div>';
    }

    function trend() {
      const data = current();
      const months = Array.from({ length: 6 }, (_, index) => {
        const key = D.addMonths(month() + '-01', index - 5).slice(0, 7);
        return { key, ...D.financeMonth(data, key) };
      });
      const max = Math.max(...months.flatMap(row => [row.income, row.expense]));
      if (!max) return '';
      const bars = months.map(row => '<li><strong>' + E(monthLabel(row.key)) + '</strong>' +
        [['Income', row.income], ['Spent', row.expense]].map(([label, value]) => '<div><small>' + E(label + ' · ' + amount(value)) +
          '</small><progress max="' + max + '" value="' + value + '" aria-label="' + E(monthLabel(row.key) + ' ' + label) + '"></progress></div>').join('') +
        '</li>').join('');
      return panel('Last six months', '<ul class="money-trend">' + bars + '</ul>');
    }

    function overview(summary) {
      const estimate = summary.unpaidTotal ? figures([['Unpaid bills', summary.unpaidTotal],
        ['Recorded balance after bills', summary.net - summary.unpaidTotal]]) : '';
      const monthly = summary.limit == null ? empty('Set a monthly limit or plan income and savings.') :
        figures([['Monthly spending limit', summary.limit], ['Spent', summary.expense]]) + usage(summary.expense, summary.limit, 'Monthly spending');
      return '<div class="stack"><div class="money-overview">' + panel('Budget at a glance', monthly,
        btn('Open Budget', 'money-view', { view: 'budget' }, { cls: 'small' })) +
        panel('Bills to pay', estimate + billRows(summary.unpaid.slice(0, 3), true), btn('Open Bills', 'money-view', { view: 'bills' }, { cls: 'small' })) +
        '</div>' + trend() + '</div>';
    }

    function billsPage(summary) {
      const visible = new Set(summary.bills.map(item => D.str(item.row.id)));
      const outside = current().billTemplates.filter(row => !row.deletedAt && !visible.has(D.str(row.id)));
      const other = outside.length ? '<details class="workspace-options"><summary>Other bill schedules (' + outside.length + ')</summary><div class="rows">' +
        outside.map(row => '<article class="row money-row"><div class="row-main"><strong>' + E(row.title) + '</strong><small>' +
          E(monthLabel(row.startMonth) + (row.endMonth ? ' – ' + monthLabel(row.endMonth) : ' onward')) + '</small></div>' +
          ibtn('edit', 'Edit ' + row.title, 'bill-edit', { id: row.id }) + '</article>').join('') + '</div></details>' : '';
      return panel('Monthly bills', billRows(summary.bills) + other, btn('Add recurring bill', 'bill-edit', {}, { cls: 'small primary', icon: 'plus' }));
    }

    function expensePage() {
      const summary = D.budgeting.month(current(), month());
      const view = state.moneyView || 'overview';
      const tools = btn('Add expense', 'money-edit', {}, { cls: 'primary', icon: 'plus' }) +
        btn('Add income', 'money-edit', { kind: 'income' }, { icon: 'plus' }) + dateNav();
      const tabs = '<div class="tabs money-tabs" aria-label="Expenses and budget views">' + Object.entries(views).map(([key, label]) =>
        btn(label, 'money-view', { view: key }, { pressed: view === key })).join('') + '</div>';
      const pages = { overview, transactions, budget: budgetPage, bills: billsPage };
      return page('', 'Expenses & Budget', monthLabel(month()) + ' · PKR', tools) + tabs + stats(summary) + pages[view](summary);
    }

    function expenseEdit(id, kind, date, bill) {
      const row = id && D.byId(current().money, id);
      if (id && (!row || row.deletedAt)) throw new Error('This transaction is in Deleted items.');
      const fields = (bill || row?.billId ? '<input type="hidden" name="type" value="expense">' : select('type', 'Type', types, row?.type || kind || 'expense')) +
        input('amount', 'Amount (PKR)', amountField(row?.amountMinor ?? bill?.row.amountMinor), { placeholder: '0.00', extra: ' inputmode="decimal" data-initial-focus' }) +
        categoryField(row?.category ?? bill?.row.category) + dateInput('date', 'Date', row?.date || date || (state.view === 'finance' ? state.date : now().date)) +
        input('title', 'Description (optional)', row?.title ?? bill?.row.title, { wide: true, extra: ' maxlength="160"' }) +
        N.field('note', 'Note (optional)', row?.note);
      openDialog('money', row ? 'Edit transaction' : bill ? 'Log payment for ' + bill.row.title : 'Add expense or income', '<form id="money-form" class="form-grid" novalidate>' +
        fields + '</form>', (row ? btn('Delete', 'money-delete', { id }, { cls: 'danger' }) : btn('Cancel', 'close-dialog')) +
        '<button type="submit" form="money-form" class="primary">Save transaction</button>', { row: row || (bill ?
          { billId: D.str(bill.row.id), billMonth: month() } : null) });
    }

    function budgetEdit(id, category = '', mode) {
      const selected = id ? D.byId(current().budgets, id) : mode === 'category' ? null : current().budgets.find(row => !row.deletedAt &&
        row.month === month() && D.categoryKey(row.category) === D.categoryKey(category));
      if (id && (!selected || selected.deletedAt)) throw new Error('This budget is in Deleted items.');
      const fields = dateInput('date', 'Month (pick a date in it)', (selected?.month || month()) + '-01') +
        input('amount', 'Budget (PKR)', amountField(selected?.amountMinor), { placeholder: '0.00', extra: ' inputmode="decimal" data-initial-focus' }) +
        categoryField(selected?.category || category) +
        (mode === 'category' ? '<input type="hidden" name="categoryBudget" value="yes">' :
          '<p class="muted wide">Leave Category empty for a total monthly budget.</p>');
      openDialog('budget', selected ? 'Edit monthly budget' : 'Set monthly budget',
        '<form id="budget-form" class="form-grid" novalidate>' + fields + '</form>',
        (selected ? btn('Delete', 'budget-delete', { id: selected.id }, { cls: 'danger' }) : btn('Cancel', 'close-dialog')) +
        '<button type="submit" form="budget-form" class="primary">Save budget</button>', { row: selected });
    }

    async function save(form, previous, budget) {
      const values = new FormData(form);
      const minor = D.parseMoney(values.get('amount'));
      if (minor === null) throw new Error('Enter a positive PKR amount with up to two decimal places.');
      const date = readDate(values, 'date', budget ? 'a date in the budget month' : 'the transaction date', true);
      const category = D.tidy(values.get('category'));
      if ((!budget || values.has('categoryBudget')) && !category) throw new Error('Choose or type a category.');
      const table = budget ? 'budgets' : 'money';
      const at = D.stamp();
      const id = previous?.id ?? D.uid();
      const row = { ...previous, id, amountMinor: minor, category, createdAt: previous?.createdAt || at, updatedAt: at, editToken: D.uid() };
      if (budget) row.month = date.slice(0, 7);
      else Object.assign(row, { date, type: values.get('type'), title: D.tidy(values.get('title')), note: D.str(values.get('note')),
        noteStyles: N.capture(values, previous?.noteStyles) });
      await commit(data => {
        const existing = D.byId(data[table], id);
        if (previous?.id != null && (!existing || existing.deletedAt || existing.editToken !== previous.editToken)) {
          throw new Error('This record changed in another tab. Reopen it to make your changes.');
        }
        if (budget && data.budgets.some(item => !item.deletedAt && item.month === row.month &&
          !D.same(item.id, id) && D.categoryKey(item.category) === D.categoryKey(category))) {
          throw new Error('This month already has a budget for that category. Open it to edit its amount.');
        }
        if (!budget && row.billId && !existing) unpaidBill(data, row.billMonth, row.billId);
        if (existing) data[table][data[table].indexOf(existing)] = row;
        else data[table].push(row);
      }, budget ? 'Budget saved.' : 'Transaction saved.');
    }

    function moneyDialog(form, title, fields, row, label, remove = '') {
      openDialog(form, title, '<form id="' + form + '" class="form-grid" novalidate>' + fields + '</form>',
        (remove || btn('Cancel', 'close-dialog')) + '<button type="submit" class="primary" form="' + form + '">' + E(label) + '</button>',
        { row });
    }

    function planEdit() {
      const row = D.byId(current().financePlans, month());
      const fields = input('expectedIncome', 'Expected income (PKR)', amountField(row?.expectedIncomeMinor),
        { extra: ' inputmode="decimal" data-initial-focus' }) +
        input('savingsTarget', 'Savings target (PKR)', amountField(row?.savingsTargetMinor), { extra: ' inputmode="decimal"' });
      moneyDialog('money-plan-form', 'Plan ' + monthLabel(month()), fields, { id: month(), editToken: row?.editToken }, 'Save plan');
    }

    async function savePlan(form, previous) {
      const values = new FormData(form);
      const expected = D.tidy(values.get('expectedIncome'));
      const target = D.tidy(values.get('savingsTarget'));
      const expectedIncomeMinor = expected ? D.parseMoney(expected) : null;
      const savingsTargetMinor = target ? D.parseMoney(target) : null;
      if (expected && expectedIncomeMinor == null || target && savingsTargetMinor == null) {
        throw new Error('Use positive PKR amounts or leave an amount blank.');
      }
      await commit(data => {
        const row = D.byId(data.financePlans, previous.id);
        if (row?.editToken !== previous.editToken) throw new Error('This month’s plan changed. Reopen it before saving.');
        const at = D.stamp();
        const saved = { id: previous.id, expectedIncomeMinor, savingsTargetMinor, createdAt: row?.createdAt || at,
          updatedAt: at, editToken: D.uid() };
        if (row) data.financePlans[data.financePlans.indexOf(row)] = saved;
        else data.financePlans.push(saved);
      }, 'Monthly plan saved.');
    }

    function billEdit({ id }) {
      const row = id && D.byId(current().billTemplates, id);
      if (id && (!row || row.deletedAt)) throw new Error('This bill is in Deleted items.');
      const fields = input('title', 'Bill name', row?.title, { wide: true, extra: ' maxlength="160" data-initial-focus' }) +
        input('amount', 'Expected payment (PKR)', amountField(row?.amountMinor), { extra: ' inputmode="decimal"' }) + categoryField(row?.category || 'Bills') +
        input('day', 'Due day each month', row?.day || Number(state.date.slice(-2)), { type: 'number', extra: ' min="1" max="31" step="1"' }) +
        dateInput('start', 'First month (pick any date)', (row?.startMonth || month()) + '-01') +
        dateInput('end', 'Last month (optional)', row?.endMonth ? row.endMonth + '-01' : '') +
        '<p class="muted wide">For shorter months, bills due on a missing day move to the last day.</p>';
      moneyDialog('bill-form', row ? 'Edit recurring bill' : 'Add recurring bill', fields, row, 'Save bill',
        row ? btn('Delete', 'bill-delete', { id }, { cls: 'danger' }) : '');
    }

    async function saveBill(form, previous) {
      const values = new FormData(form);
      const title = D.tidy(values.get('title'));
      const category = D.tidy(values.get('category'));
      const day = Number(values.get('day'));
      const amountMinor = D.parseMoney(values.get('amount'));
      const startMonth = readDate(values, 'start', 'a date in the first month', true).slice(0, 7);
      const endMonth = readDate(values, 'end', 'a date in the last month').slice(0, 7);
      if (!title || title.length > 160 || !category || category.length > 80 || amountMinor == null ||
          !Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error('Enter a bill name, category, positive amount and due day from 1 to 31.');
      }
      if (endMonth && endMonth < startMonth) throw new Error('Choose a last month on or after the first month.');
      await commit(data => {
        const row = previous && D.byId(data.billTemplates, previous.id);
        if (previous && (!row || row.deletedAt || row.editToken !== previous.editToken)) throw new Error('This bill changed. Reopen it before saving.');
        const at = D.stamp();
        const fields = { title, category, day, amountMinor, startMonth, endMonth, updatedAt: at, editToken: D.uid() };
        if (row) Object.assign(row, fields);
        else data.billTemplates.push({ id: D.uid(), createdAt: at, ...fields });
      }, 'Recurring bill saved.');
    }

    function unpaidBill(data, key, id) {
      const bill = D.budgeting.month(data, key).unpaid.find(item => D.same(item.row.id, id));
      if (!bill) throw new Error('This bill has already been paid or its schedule changed.');
      return bill;
    }

    function billPay({ id }) {
      const bill = unpaidBill(current(), month(), id);
      expenseEdit(null, 'expense', now().date.startsWith(month()) ? now().date : bill.due, bill);
    }

    function billLink({ id }) {
      const data = current();
      const bill = unpaidBill(data, month(), id);
      const options = { '': 'Choose an expense', ...Object.fromEntries(D.financeMonth(data, month()).records
        .filter(row => row.type === 'expense' && !row.billId).sort((a, b) => b.date.localeCompare(a.date)).map(row =>
          [row.id, [D.formatDate(row.date), row.title || row.category, amount(row.amountMinor)].join(' · ')])) };
      if (Object.keys(options).length === 1) throw new Error('There are no unlinked expenses in this month. Use Log payment to add one.');
      moneyDialog('bill-link-form', 'Link payment for ' + bill.row.title, select('transaction', 'Expense', options, ''),
        { id: D.str(id), month: month() }, 'Link expense');
    }

    async function saveBillLink(form, previous) {
      const id = new FormData(form).get('transaction');
      await commit(data => {
        unpaidBill(data, previous.month, previous.id);
        const row = D.byId(data.money, id);
        if (!row || row.deletedAt || row.type !== 'expense' || row.billId || !row.date.startsWith(previous.month + '-')) {
          throw new Error('Choose an unlinked expense from this month.');
        }
        Object.assign(row, { billId: previous.id, billMonth: previous.month, updatedAt: D.stamp(), editToken: D.uid() });
      }, 'Expense linked to bill.');
    }

    function csvText(value) {
      const text = D.str(value);
      return '"' + (/^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" : '') + text.replace(/"/g, '""') + '"';
    }

    function exportMonth() {
      const summary = D.financeMonth(current(), month());
      const rows = filter(summary);
      const csv = [['Date', 'Type', 'Category', 'Description', 'Note', 'Currency', 'Amount'],
        ...rows.map(row => [D.formatDate(row.date), types[row.type], row.category, row.title, row.note, 'PKR', amountField(row.amountMinor)])];
      download('\ufeff' + csv.map(row => row.map(csvText).join(',')).join('\r\n') + '\r\n',
        'Expenses_' + monthLabel(month()).replace(' ', '-') + '.csv', 'text/csv;charset=utf-8');
    }

    const deletion = (id, table, label) => ask('Move ' + label + ' to Deleted items?',
      'You can recover it in Settings & Backups.', 'Move to Deleted items', () => removeRecord(table, id));

    function review(key) {
      const summary = D.financeMonth(current(), key);
      return panel('Expenses · ' + monthLabel(key), '<p class="muted">Spent ' + E(amount(summary.expense)) +
        ' · Income ' + E(amount(summary.income)) + (summary.remaining == null ? '' : ' · Budget remaining ' + E(amount(summary.remaining))) +
        '</p>' + categoryRows(summary), btn('Expenses', 'navigate', { view: 'finance', date: key + '-01' }, { cls: 'text-button' }));
    }

    return {
      page: expensePage, save, review, forms: { 'money-plan-form': savePlan, 'bill-form': saveBill, 'bill-link-form': saveBillLink },
      filter(form) {
        const values = new FormData(form);
        for (const key of ['moneyType', 'moneyCategory', 'moneyQuery']) state[key] = D.tidy(values.get(key));
        render();
      },
      actions: {
        'money-edit': data => expenseEdit(data.id, data.kind, data.date),
        'budget-edit': data => budgetEdit(data.id, data.category, data.mode),
        'money-view': ({ view }) => { if (Object.hasOwn(views, view)) { state.moneyView = view; render(); } },
        'money-plan-edit': planEdit,
        'money-copy-budget': () => commit(data => D.budgeting.copyBudget(data, month()) || false, 'Previous month’s budget copied.'),
        'bill-edit': billEdit, 'bill-pay': billPay, 'bill-link': billLink,
        'bill-delete': ({ id }) => deletion(id, 'billTemplates', 'this recurring bill'),
        'money-delete': data => deletion(data.id, 'money', 'transaction'),
        'budget-delete': data => deletion(data.id, 'budgets', 'budget'),
        'money-clear': () => { state.moneyType = state.moneyCategory = state.moneyQuery = ''; render(); },
        'money-export': exportMonth
      }
    };
  };
})(Diary);
