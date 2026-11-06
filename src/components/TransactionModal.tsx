import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Calendar,
  Check,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import {
  ALL_RECURRING_FREQUENCIES,
  RECURRING_FREQUENCY_LABELS,
  RecurringFrequency,
  Transaction,
  TransactionType
} from '../domain/models';
import { CentsMath, Money } from '../domain/cents';
import { todayIso } from '../domain/localDate';
import { PickerLogic } from '../domain/displayName';
import { TransactionSuggestions } from '../domain/contributorAmounts';
import { TransactionValidator } from '../domain/transactionLogic';
import { useBudget } from '../state/BudgetContext';

export interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTransaction?: Partial<Transaction> | null;
  isDuplicate?: boolean;
  defaultAccountId?: string | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  initialTransaction,
  isDuplicate = false,
  defaultAccountId = null
}) => {
  const {
    snapshot,
    activeAccounts,
    balanceById,
    transactionSuggestions,
    sessionLastTransactionDate,
    setSessionLastTransactionDate,
    saveTransaction,
    deleteTransaction,
    saveCategory
  } = useBudget();

  const isEditing = Boolean(initialTransaction?.id && !isDuplicate);

  // Keep a ref to sessionLastTransactionDate so changing it does not trigger the form-open reset effect
  const sessionDateRef = useRef(sessionLastTransactionDate);
  sessionDateRef.current = sessionLastTransactionDate;

  const defaultFromAccount = useMemo(() => {
    if (initialTransaction?.accountId) return initialTransaction.accountId;
    if (defaultAccountId) return defaultAccountId;
    const checking = activeAccounts.find((a) => a.type === 'CHECKING');
    return checking?.id ?? activeAccounts[0]?.id ?? '';
  }, [initialTransaction, defaultAccountId, activeAccounts]);

  const [type, setType] = useState<TransactionType>(
    initialTransaction?.type ?? TransactionType.EXPENSE
  );
  const [amountInput, setAmountInput] = useState<string>(
    initialTransaction?.amount && initialTransaction.amount > 0
      ? CentsMath.toPlain(initialTransaction.amount)
      : ''
  );
  const [accountId, setAccountId] = useState<string>(defaultFromAccount);
  const [toAccountId, setToAccountId] = useState<string>(
    initialTransaction?.toAccountId ?? ''
  );
  const [category, setCategory] = useState<string>(
    initialTransaction?.category ?? ''
  );
  const [subCategory, setSubCategory] = useState<string>(
    initialTransaction?.subCategory ?? ''
  );
  // Retain sessionLastTransactionDate when adding new transactions; duplicates default to today
  const [date, setDate] = useState<string>(() => {
    if (isDuplicate) return todayIso();
    return initialTransaction?.date?.trim() || sessionDateRef.current || todayIso();
  });
  const [payee, setPayee] = useState<string>(initialTransaction?.payee ?? '');
  const [note, setNote] = useState<string>(initialTransaction?.note ?? '');
  const [tag, setTag] = useState<string>(initialTransaction?.tag ?? '');
  const [cleared, setCleared] = useState<boolean>(
    isDuplicate ? true : initialTransaction?.cleared ?? true
  );
  const [repeatFrequency, setRepeatFrequency] = useState<RecurringFrequency | ''>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showNewCategoryInline, setShowNewCategoryInline] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubCategoryName, setNewSubCategoryName] = useState('');

  // Only reset form state when the modal opens or target transaction changes
  useEffect(() => {
    if (!isOpen) return;
    setType(initialTransaction?.type ?? TransactionType.EXPENSE);
    setAmountInput(
      initialTransaction?.amount && initialTransaction.amount > 0
        ? CentsMath.toPlain(initialTransaction.amount)
        : ''
    );
    setAccountId(defaultFromAccount);
    setToAccountId(initialTransaction?.toAccountId ?? '');
    setCategory(initialTransaction?.category ?? '');
    setSubCategory(initialTransaction?.subCategory ?? '');
    setDate(
      isDuplicate
        ? todayIso()
        : initialTransaction?.date?.trim() || sessionDateRef.current || todayIso()
    );
    setPayee(initialTransaction?.payee ?? '');
    setNote(initialTransaction?.note ?? '');
    setTag(initialTransaction?.tag ?? '');
    setCleared(isDuplicate ? true : initialTransaction?.cleared ?? true);
    setRepeatFrequency('');
    setErrorMsg(null);
    setShowNewCategoryInline(false);
  }, [isOpen, initialTransaction, isDuplicate, defaultFromAccount]);

  const availableCategories = useMemo(() => {
    const names = snapshot.categories.map((c) => c.name);
    return PickerLogic.mergeDistinctNames(names, transactionSuggestions.categories);
  }, [snapshot.categories, transactionSuggestions.categories]);

  const availableSubCategories = useMemo(() => {
    if (!category.trim()) return [];
    const fromHistory =
      transactionSuggestions.subCategoriesByCategory.get(
        category.trim().toLowerCase()
      ) ?? [];
    return PickerLogic.subCategoriesForCategory(
      category,
      snapshot.categories,
      fromHistory
    );
  }, [category, snapshot.categories, transactionSuggestions]);

  useEffect(() => {
    if (
      subCategory &&
      availableSubCategories.length > 0 &&
      !availableSubCategories.some(
        (s) => s.toLowerCase() === subCategory.trim().toLowerCase()
      )
    ) {
      setSubCategory('');
    }
  }, [category, availableSubCategories, subCategory]);

  if (!isOpen) return null;

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
  };

  const handlePayeeChange = (val: string) => {
    setPayee(val);
    if (!category.trim() && type !== TransactionType.TRANSFER) {
      const suggested = TransactionSuggestions.suggestCategoryForPayee(
        transactionSuggestions,
        val
      );
      if (suggested) {
        setCategory(suggested.category);
        if (suggested.subCategory) {
          setSubCategory(suggested.subCategory);
        }
      }
    }
  };

  const handleCreateCategoryInline = async () => {
    if (!newCategoryName.trim()) return;
    const subs = newSubCategoryName.trim() ? [newSubCategoryName.trim()] : [];
    await saveCategory({
      name: newCategoryName.trim(),
      subCategories: subs,
      colorHex: '#2563EB'
    });
    setCategory(newCategoryName.trim());
    if (newSubCategoryName.trim()) {
      setSubCategory(newSubCategoryName.trim());
    }
    setNewCategoryName('');
    setNewSubCategoryName('');
    setShowNewCategoryInline(false);
  };

  const submitForm = async (keepOpenForNext: boolean) => {
    const cents = CentsMath.parse(amountInput);
    const validation = TransactionValidator.validate({
      amount: cents,
      type,
      accountId: accountId || null,
      toAccountId: type === TransactionType.TRANSFER ? toAccountId || null : null,
      category: type === TransactionType.TRANSFER ? 'Transfer' : category,
      date
    });
    if (!validation.valid) {
      setErrorMsg(validation.message);
      return;
    }

    // Retain session date only when saving a new (non-duplicate, non-edit) transaction
    if (!isEditing && !isDuplicate && date.trim()) {
      setSessionLastTransactionDate(date.trim());
    }

    await saveTransaction({
      id: isEditing ? initialTransaction?.id : undefined,
      type,
      amount: cents,
      accountId: accountId || null,
      toAccountId: type === TransactionType.TRANSFER ? toAccountId || null : null,
      contributorId: initialTransaction?.contributorId ?? null,
      category: type === TransactionType.TRANSFER ? '' : category,
      subCategory: type === TransactionType.TRANSFER ? '' : subCategory,
      date,
      payee: payee.trim() || note.trim() || category.trim(),
      note: note.trim(),
      tag: tag.trim(),
      isRecurring: isEditing
        ? Boolean(initialTransaction?.isRecurring || repeatFrequency)
        : Boolean(repeatFrequency),
      cleared,
      createdAt: isEditing ? initialTransaction?.createdAt : undefined,
      repeatFrequency: repeatFrequency || null,
      isDuplicate
    });

    if (keepOpenForNext && !isEditing) {
      // Keep sticky date & account for rapid reconciliation; reset amount, payee, note
      setAmountInput('');
      setPayee('');
      setNote('');
      setErrorMsg(null);
    } else {
      onClose();
    }
  };

  const topAmountsForSelectedCategory =
    category.trim()
      ? transactionSuggestions.categoryTopAmounts.get(
          category.trim().toLowerCase()
        ) ?? []
      : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {isEditing
              ? 'Edit Transaction'
              : isDuplicate
              ? 'Duplicate Transaction'
              : 'Add Transaction'}
          </h3>
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Type Selector */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 14
          }}
        >
          {(
            [
              [TransactionType.EXPENSE, 'Expense', 'var(--expense)'],
              [TransactionType.INCOME, 'Income', 'var(--income)'],
              [TransactionType.TRANSFER, 'Transfer', 'var(--transfer)']
            ] as const
          ).map(([t, label, color]) => {
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 11,
                  border: active ? `2px solid ${color}` : '1px solid var(--outline)',
                  backgroundColor: active
                    ? 'var(--surface-variant)'
                    : 'var(--surface-container)',
                  color: active ? color : 'var(--on-surface-variant)',
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: 'pointer'
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '9px 12px',
              borderRadius: 10,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--expense)',
              fontSize: 13,
              marginBottom: 12
            }}
          >
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Amount & Date Row */}
          <div className="grid-2">
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginBottom: 5
                }}
              >
                Amount ($)
              </label>
              <input
                className="input mono-num"
                style={{ fontSize: 18, fontWeight: 700 }}
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                autoFocus
              />
              {topAmountsForSelectedCategory.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginTop: 6
                  }}
                >
                  {topAmountsForSelectedCategory.slice(0, 4).map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className="chip"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => setAmountInput(CentsMath.toPlain(amt))}
                    >
                      {Money.format(amt)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 5
                }}
              >
                <label style={{ fontSize: 12.5, fontWeight: 600 }}>
                  <Calendar
                    size={13}
                    style={{ verticalAlign: 'middle', marginRight: 4 }}
                  />
                  Date {!isEditing && !isDuplicate && '(retained in session)'}
                </label>
                {date !== todayIso() && (
                  <button
                    type="button"
                    onClick={() => handleDateChange(todayIso())}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Reset to Today
                  </button>
                )}
              </div>
              <input
                type="date"
                className="input mono-num"
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
          </div>

          {/* Accounts Row */}
          <div className={type === TransactionType.TRANSFER ? 'grid-2' : undefined}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginBottom: 5
                }}
              >
                {type === TransactionType.TRANSFER ? 'From Account' : 'Account'}
              </label>
              <select
                className="select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Select account...</option>
                {activeAccounts.map((acc) => {
                  const bal = balanceById.get(acc.id)?.currentBalance ?? 0;
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({Money.format(bal)})
                    </option>
                  );
                })}
              </select>
            </div>

            {type === TransactionType.TRANSFER && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    marginBottom: 5
                  }}
                >
                  <ArrowRightLeft
                    size={13}
                    style={{ verticalAlign: 'middle', marginRight: 4 }}
                  />
                  To Account / Envelope
                </label>
                <select
                  className="select"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                >
                  <option value="">Select destination...</option>
                  {activeAccounts
                    .filter((a) => a.id !== accountId)
                    .map((acc) => {
                      const bal = balanceById.get(acc.id)?.currentBalance ?? 0;
                      return (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({Money.format(bal)})
                        </option>
                      );
                    })}
                </select>
              </div>
            )}
          </div>

          {/* Payee / Description with history autocomplete */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12.5,
                fontWeight: 600,
                marginBottom: 5
              }}
            >
              Payee / Description
            </label>
            <input
              className="input"
              list="wb-payee-suggestions"
              placeholder={
                type === TransactionType.INCOME
                  ? 'e.g. Employer Paycheck, Client'
                  : 'e.g. Whole Foods, Shell, Netflix'
              }
              value={payee}
              onChange={(e) => handlePayeeChange(e.target.value)}
            />
            <datalist id="wb-payee-suggestions">
              {transactionSuggestions.payees.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          {/* Category & Subcategory (non-transfer) */}
          {type !== TransactionType.TRANSFER && (
            <>
              <div className="grid-2">
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 5
                    }}
                  >
                    <label style={{ fontSize: 12.5, fontWeight: 600 }}>Category</label>
                    <button
                      type="button"
                      onClick={() => setShowNewCategoryInline((v) => !v)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      + New Category
                    </button>
                  </div>
                  <select
                    className="select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Select category...</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Sub-Category (optional)
                  </label>
                  <input
                    className="input"
                    list="wb-subcat-suggestions"
                    placeholder="Select or type sub-category..."
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                  />
                  <datalist id="wb-subcat-suggestions">
                    {availableSubCategories.map((sub) => (
                      <option key={sub} value={sub} />
                    ))}
                  </datalist>
                </div>
              </div>

              {showNewCategoryInline && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: 'var(--surface-container)',
                    border: '1px solid var(--outline)',
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center'
                  }}
                >
                  <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 140 }}
                    placeholder="Category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 140 }}
                    placeholder="Initial sub-category (optional)"
                    value={newSubCategoryName}
                    onChange={(e) => setNewSubCategoryName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleCreateCategoryInline()}
                  >
                    Add
                  </button>
                </div>
              )}
            </>
          )}

          {/* Note & Tag Row */}
          <div className="grid-2">
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginBottom: 5
                }}
              >
                Note (optional)
              </label>
              <input
                className="input"
                placeholder="Memo or details..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginBottom: 5
                }}
              >
                Tag (optional)
              </label>
              <input
                className="input"
                list="wb-tag-suggestions"
                placeholder="e.g. vacation, tax, reimburse"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <datalist id="wb-tag-suggestions">
                {transactionSuggestions.tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Cleared & Repeat Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              padding: '10px 12px',
              borderRadius: 12,
              backgroundColor: 'var(--surface-container)'
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 13.5,
                fontWeight: 600
              }}
            >
              <input
                type="checkbox"
                checked={cleared}
                onChange={(e) => setCleared(e.target.checked)}
              />
              Cleared in bank / statement
            </label>

            {!isEditing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Repeat size={15} style={{ color: 'var(--on-surface-variant)' }} />
                <select
                  className="select"
                  style={{ width: 'auto', padding: '5px 10px', fontSize: 12.5 }}
                  value={repeatFrequency}
                  onChange={(e) =>
                    setRepeatFrequency(e.target.value as RecurringFrequency | '')
                  }
                >
                  <option value="">Does not repeat</option>
                  {ALL_RECURRING_FREQUENCIES.map((freq) => (
                    <option key={freq} value={freq}>
                      Repeat {RECURRING_FREQUENCY_LABELS[freq]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Footer Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 18,
            gap: 8,
            flexWrap: 'wrap'
          }}
        >
          <div>
            {isEditing && initialTransaction?.id && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  await deleteTransaction(initialTransaction.id!);
                  onClose();
                }}
              >
                <Trash2 size={15} />
                Delete
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            {!isEditing && (
              <button
                type="button"
                className="btn btn-tonal"
                onClick={() => void submitForm(true)}
                title="Save and keep modal open with the same date for fast reconciliation"
              >
                <Plus size={16} />
                Save &amp; Add Another
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submitForm(false)}
            >
              <Check size={16} />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
