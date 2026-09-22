import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  customerInputSchema,
  type BusinessCustomer,
} from '@cieslacalc/business-core';
import { useQueryClient } from '@tanstack/react-query';
import { businessCopy } from '../copy';
import { customerFields, useCustomers } from '../customers/Customers';
import { useBusiness } from '../context';
import { workspaceClient } from '../workspace/client';
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
  const business = useBusiness(),
    cache = useQueryClient();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(false);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    try {
      let customer = selected;
      if (!customer) {
        if (!business.organizationId) throw new Error('organization-required');
        customer = await workspaceClient.createCustomer(
          business.organizationId,
          customerInputSchema.parse({
            ...Object.fromEntries(
              customerFields.map(([key]) => [
                key,
                value(key === 'name' ? 'customerName' : key),
              ]),
            ),
            type: value('type'),
            notes: value('notes'),
          }),
        );
        setSelected(customer);
        await cache.invalidateQueries({
          queryKey: ['business', business.organizationId],
        });
      }
      await onCreate({
        projectName: value('projectName'),
        location: value('location') || undefined,
        customerId: customer.id,
        customer,
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
        <button
          type="button"
          className="a-button"
          onClick={onCancel}
          disabled={busy}
        >
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
      {search && query.isError && (
        <p role="alert">
          {pl
            ? 'Nie można pobrać klientów. Spróbuj ponownie.'
            : 'Customers unavailable. Try again.'}
        </p>
      )}
      {search && query.data?.items.length === 0 && (
        <p>
          {pl
            ? 'Nie znaleziono klienta. Dodaj nowego poniżej.'
            : 'No matching customer. Add a customer below.'}
        </p>
      )}
      {selected ? (
        <p>
          {selected.name}{' '}
          <button
            type="button"
            className="a-button"
            onClick={() => setSelected(undefined)}
          >
            {pl ? '+ Nowy klient' : '+ New customer'}
          </button>
        </p>
      ) : (
        <>
          <label>
            {pl ? 'Typ klienta' : 'Customer type'}
            <select name="type" defaultValue="person">
              <option value="person">{pl ? 'Osoba' : 'Person'}</option>
              <option value="company">{pl ? 'Firma' : 'Company'}</option>
            </select>
          </label>
          <label>
            {m.customerName}
            <input name="customerName" required maxLength={240} autoFocus />
          </label>
          <details className="bz-customer-details">
            <summary>{m.customerDetailsOptional}</summary>
            <div className="bz-form-grid">
              {customerFields
                .filter(([key]) => key !== 'name')
                .map(([key, pol, en]) => (
                  <label key={key}>
                    {pl ? pol : en}
                    <input
                      name={key}
                      type={key === 'email' ? 'email' : 'text'}
                      maxLength={
                        key === 'address'
                          ? 400
                          : key === 'phone' || key === 'taxId'
                            ? 64
                            : key === 'postalCode'
                              ? 32
                              : key === 'email'
                                ? 254
                                : 240
                      }
                    />
                  </label>
                ))}
              <label>
                {pl ? 'Notatki' : 'Notes'}
                <textarea name="notes" maxLength={8000} />
              </label>
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
