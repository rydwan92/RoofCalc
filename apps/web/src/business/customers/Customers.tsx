import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  BusinessCustomer,
  CustomerInput,
} from '@cieslacalc/business-core';
import { useBusiness } from '../context';
import { workspaceClient } from '../workspace/client';
import { RecentEstimations } from '../estimations/RecentEstimations';

export function useCustomers(search: string, offset = 0) {
  const { organizationId } = useBusiness();
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  return useQuery({
    queryKey: ['business', organizationId, 'customers', debounced, offset],
    queryFn: () =>
      workspaceClient.customers(organizationId!, debounced, offset),
    enabled: !!organizationId,
    retry: false,
  });
}
export const customerFields = [
  ['name', 'Imię i nazwisko / nazwa', 'Name'],
  ['companyName', 'Firma', 'Company'],
  ['taxId', 'NIP', 'Tax ID'],
  ['email', 'Email', 'Email'],
  ['phone', 'Telefon', 'Phone'],
  ['address', 'Adres', 'Address'],
  ['postalCode', 'Kod pocztowy', 'Postal code'],
  ['city', 'Miejscowość', 'City'],
] as const;

export function Customers({
  onClose,
  onNewEstimation,
  onOpenEstimation,
}: {
  onClose: () => void;
  onNewEstimation: (customer: BusinessCustomer) => void;
  onOpenEstimation: (id: string) => Promise<void> | void;
}) {
  const { i18n } = useTranslation(),
    pl = i18n.language.startsWith('pl');
  const { organizationId } = useBusiness(),
    cache = useQueryClient();
  const [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<BusinessCustomer>(),
    [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const query = useCustomers(search, offset);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries([
      ...customerFields.map(([key]) => [
        key,
        String(form.get(key) ?? '').trim(),
      ]),
      ['notes', String(form.get('notes') ?? '')],
      ['type', String(form.get('type'))],
    ]) as CustomerInput;
    setBusy(true);
    setError(false);
    try {
      const customer = selected
        ? await workspaceClient.updateCustomer(
            organizationId,
            selected.id,
            input,
          )
        : await workspaceClient.createCustomer(organizationId, input);
      setSelected(customer);
      setEditing(false);
      await cache.invalidateQueries({ queryKey: ['business', organizationId] });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="bz-home-section bz-customers"
      data-testid="business-customers"
    >
      <div className="bz-section-heading">
        <h2>{pl ? 'Klienci' : 'Customers'}</h2>
        <button className="a-button" onClick={onClose}>
          {pl ? 'Wróć' : 'Back'}
        </button>
      </div>
      {editing ? (
        <form
          key={selected?.id ?? 'new'}
          className="bz-estimation-form"
          onSubmit={submit}
        >
          <h3>
            {selected
              ? pl
                ? 'Edytuj klienta'
                : 'Edit customer'
              : pl
                ? 'Nowy klient'
                : 'New customer'}
          </h3>
          <label>
            {pl ? 'Typ klienta' : 'Customer type'}
            <select name="type" defaultValue={selected?.type ?? 'person'}>
              <option value="person">{pl ? 'Osoba' : 'Person'}</option>
              <option value="company">{pl ? 'Firma' : 'Company'}</option>
            </select>
          </label>
          <div className="bz-form-grid">
            {customerFields.map(([key, pol, en]) => (
              <label key={key}>
                {pl ? pol : en}
                <input
                  name={key}
                  required={key === 'name'}
                  type={key === 'email' ? 'email' : 'text'}
                  defaultValue={selected?.[key] ?? ''}
                  maxLength={
                    key === 'address'
                      ? 400
                      : key === 'phone' || key === 'taxId'
                        ? 64
                        : key === 'postalCode'
                          ? 32
                          : 240
                  }
                />
              </label>
            ))}
          </div>
          <label>
            {pl ? 'Notatki' : 'Notes'}
            <textarea
              name="notes"
              defaultValue={selected?.notes}
              maxLength={8000}
            />
          </label>
          {error && (
            <p role="alert">
              {pl
                ? 'Nie udało się zapisać klienta.'
                : 'Customer could not be saved.'}
            </p>
          )}
          <button className="a-button a-primary" disabled={busy}>
            {pl ? 'Zapisz klienta' : 'Save customer'}
          </button>
          <button
            type="button"
            className="a-button"
            onClick={() => setEditing(false)}
          >
            {pl ? 'Anuluj' : 'Cancel'}
          </button>
        </form>
      ) : selected ? (
        <>
          <h3>{selected.name}</h3>
          <p>
            {[
              selected.companyName,
              selected.taxId,
              selected.address,
              selected.postalCode,
              selected.city,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p>{[selected.email, selected.phone].filter(Boolean).join(' · ')}</p>
          <p>{selected.notes}</p>
          <button className="a-button" onClick={() => setEditing(true)}>
            {pl ? 'Edytuj dane' : 'Edit details'}
          </button>
          <button
            className="a-button a-primary"
            onClick={() => onNewEstimation(selected)}
          >
            {pl ? 'Nowa wycena' : 'New estimation'}
          </button>
          <button className="a-button" onClick={() => setSelected(undefined)}>
            {pl ? 'Lista klientów' : 'Customer list'}
          </button>
          <RecentEstimations
            customerId={selected.id}
            onOpen={onOpenEstimation}
          />
        </>
      ) : (
        <>
          <div className="bz-section-heading">
            <button
              className="a-button a-primary"
              onClick={() => {
                setSelected(undefined);
                setEditing(true);
              }}
            >
              {pl ? '+ Nowy klient' : '+ New customer'}
            </button>
            <label>
              {pl ? 'Szukaj klientów' : 'Search customers'}
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
              />
            </label>
          </div>
          {query.isError ? (
            <p role="alert">
              {pl
                ? 'Dane klientów są niedostępne.'
                : 'Customer data unavailable.'}{' '}
              <button onClick={() => void query.refetch()}>
                {pl ? 'Spróbuj ponownie' : 'Retry'}
              </button>
            </p>
          ) : query.isPending ? (
            <p>…</p>
          ) : (
            <ul className="bz-recent-list">
              {query.data.items.map((customer) => (
                <li key={customer.id}>
                  <button onClick={() => setSelected(customer)}>
                    <span>
                      <strong>{customer.name}</strong>
                      <small>
                        {[customer.companyName, customer.city, customer.taxId]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                      <small>
                        {[customer.phone, customer.email]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.data?.items.length === 0 && (
            <p>
              {pl
                ? 'Brak klientów. Dodaj pierwszego klienta.'
                : 'No customers. Add your first customer.'}
            </p>
          )}
          {offset > 0 && (
            <button
              className="a-button"
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              {pl ? 'Poprzedni' : 'Previous'}
            </button>
          )}
          {query.data?.nextOffset !== undefined && (
            <button
              className="a-button"
              onClick={() => setOffset(query.data!.nextOffset!)}
            >
              {pl ? 'Następni' : 'Next'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
