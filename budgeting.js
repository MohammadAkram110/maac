/* Offline monthly plans and recurring bill occurrences. Amounts are in paisa. */
(function (D) {
  'use strict';

  const validMonth = month => typeof month === 'string' && D.parseDate(month + '-01') === month + '-01';
  const minor = value => Number.isSafeInteger(value) && value > 0 && value <= D.MONEY_LIMIT;
  const billKey = row => row.billId && row.billMonth ? JSON.stringify([D.str(row.billId), row.billMonth]) : '';

  function validate(data) {
    for (const row of data.financePlans) {
      if (!validMonth(row.id) || [row.expectedIncomeMinor, row.savingsTargetMinor].some(value => value != null && !minor(value))) {
        throw new Error('A finance plan has an invalid month, income or savings target.');
      }
    }
    for (const row of data.billTemplates) {
      if (typeof row.title !== 'string' || !D.tidy(row.title) || row.title.length > 160 ||
          typeof row.category !== 'string' || !D.tidy(row.category) || row.category.length > 80 || !minor(row.amountMinor) ||
          !Number.isInteger(row.day) || row.day < 1 || row.day > 31 || !validMonth(row.startMonth) ||
          row.endMonth && (!validMonth(row.endMonth) || row.endMonth < row.startMonth)) {
        throw new Error('A recurring bill has an invalid name, amount or schedule.');
      }
    }
    const active = new Set();
    for (const row of data.money) {
      if (row.billId == null && row.billMonth == null) continue;
      const key = billKey(row);
      if (!key || typeof row.billId !== 'string' || !validMonth(row.billMonth) || row.type !== 'expense' ||
          !row.deletedAt && active.has(key)) throw new Error('A bill has an invalid or duplicate payment.');
      if (!row.deletedAt) active.add(key);
    }
  }

  function month(data, key) {
    const summary = D.financeMonth(data, key);
    const plan = D.byId(data.financePlans, key) || null;
    const payments = new Map(data.money.filter(row => !row.deletedAt && row.billMonth === key && row.billId)
      .map(row => [row.billId, row]));
    const [, end] = D.monthRange(key + '-01');
    const bills = data.billTemplates.filter(row => payments.has(D.str(row.id)) ||
      !row.deletedAt && row.startMonth <= key && (!row.endMonth || row.endMonth >= key)).map(row => {
      const due = key + '-' + String(Math.min(row.day, Number(end.slice(-2)))).padStart(2, '0');
      return { row, due, paid: payments.get(D.str(row.id)) };
    }).sort((a, b) => a.due.localeCompare(b.due) || a.row.title.localeCompare(b.row.title));
    const unpaid = bills.filter(item => !item.paid);
    const unpaidTotal = unpaid.reduce((total, item) => total + item.row.amountMinor, 0);
    const spendingPlan = plan?.expectedIncomeMinor == null ? null :
      Math.max(0, plan.expectedIncomeMinor - (plan.savingsTargetMinor || 0));
    const limit = summary.budget?.amountMinor ?? spendingPlan;
    const allocated = summary.categories.reduce((total, row) => total + (row.budget?.amountMinor || 0), 0);
    return { ...summary, plan, bills, unpaid, unpaidTotal, spendingPlan, limit, allocated };
  }

  function copyBudget(data, to, at = D.stamp()) {
    const from = D.addMonths(to + '-01', -1).slice(0, 7);
    const active = data.budgets.filter(row => !row.deletedAt);
    const copied = active.filter(row => row.month === from &&
      !active.some(other => other.month === to && D.categoryKey(other.category) === D.categoryKey(row.category)));
    for (const row of copied) {
      data.budgets.push({ id: D.uid(), month: to, category: row.category, amountMinor: row.amountMinor,
        createdAt: at, updatedAt: at, editToken: D.uid() });
    }
    const plan = D.byId(data.financePlans, from);
    if (plan && !D.byId(data.financePlans, to)) {
      data.financePlans.push({ id: to, expectedIncomeMinor: plan.expectedIncomeMinor, savingsTargetMinor: plan.savingsTargetMinor,
        createdAt: at, updatedAt: at, editToken: D.uid() });
      return copied.length + 1;
    }
    return copied.length;
  }

  D.budgeting = { validMonth, billKey, validate, month, copyBudget };
})(Diary);
