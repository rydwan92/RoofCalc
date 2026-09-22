import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { BusinessCustomer } from '@cieslacalc/business-core';
import { businessCopy } from '../copy';
import { useCustomers } from '../customers/Customers';
import type { NewEstimationInput } from '../BusinessHome';

export function NewEstimationForm({
  customer,
  onCreate,
  onCancel,
}: {
  customer?: BusinessCustomer;
  onCreate: (input: NewEstimationInput) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl'),
    m = businessCopy(i18n.language);
  const [selected, setSelected] = useState(customer),
    [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const query = useCustomers(search);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(false);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    try {
      await onCreate({
        projectName: value('projectName'),
        location: value('location') || undefined,
        customerId: selected?.id,
        customer: selected ?? {
          name: value('customerName'),
          companyName: value('companyName') || undefined,
          email: value('email') || undefined,
          phone: value('phone') || undefined,
          taxId: value('taxId') || undefined,
          address: value('address') || undefined,
        },
      });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="bz-estimation-form" onSubmit={submit}>
      <div className="bz-section-heading">
        <h2>{m.customerAndProject}</h2>
        <button type="button" className="a-button" onClick={onCancel}>
          {m.cancel}
        </button>
      </div>
      <label>
        {pl ? 'Wyszukaj istniejącego klienta' : 'Find existing customer'}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {search && query.data && (
        <ul className="bz-recent-list">
          {query.data.items.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(entry);
                  setSearch('');
                }}
              >
                {entry.name} {entry.companyName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <p>
          {selected.name}{' '}
          <button
            type="button"
            className="a-button"
            onClick={() => setSelected(undefined)}
          >
            {pl ? 'Zmień / nowy klient' : 'Change / new customer'}
          </button>
        </p>
      ) : (
        <>
          <label>
            {m.customerName}
            <input name="customerName" required maxLength={240} autoFocus />
          </label>
          <details className="bz-customer-details">
            <summary>{m.customerDetailsOptional}</summary>
            <div className="bz-form-grid">
              {(
                ['companyName', 'taxId', 'email', 'phone', 'address'] as const
              ).map((key) => (
                <label key={key}>
                  {m[key]}
                  <input name={key} type={key === 'email' ? 'email' : 'text'} />
                </label>
              ))}
            </div>
          </details>
        </>
      )}
      <div className="bz-form-grid">
        <label>
          {m.investmentName}
          <input name="projectName" required maxLength={240} />
        </label>
        <label>
          {m.locationOptional}
          <input name="location" maxLength={400} />
        </label>
      </div>
      {error && <p role="alert">{m.estimationCreateFailed}</p>}
      <button className="a-button a-primary" disabled={busy}>
        {busy ? '…' : pl ? 'Utwórz wycenę' : 'Create estimation'}
      </button>
    </form>
  );
}
