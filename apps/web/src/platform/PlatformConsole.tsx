import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Boxes,
  Building2,
  Database,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  suggestOrganizationSlug,
  type PlatformOrganization,
  type PlatformSystem,
  type PlatformUser,
} from '@cieslacalc/business-core';
import { sessionClient } from '../business/auth/client';
import { BusinessClientError } from '../business/client';
import { catalogClient } from '../catalog/client';
import { platformClient } from './client';
import './platform.css';

type Section = 'dashboard' | 'organizations' | 'users' | 'catalogue' | 'system';
type Role = 'owner' | 'admin' | 'sales';

const COPY = {
  pl: {
    title: 'RoofCalc — panel systemowy',
    subtitle: 'Operator platformy. Hurtownie zarządzają swoimi danymi osobno.',
    back: 'Strona główna',
    dashboard: 'Pulpit',
    organizations: 'Organizacje',
    users: 'Użytkownicy',
    catalogue: 'Katalog',
    system: 'Baza i system',
    loading: 'Wczytywanie…',
    noSession: 'Zaloguj się kontem administratora platformy.',
    signIn: 'Przejdź do logowania',
    forbidden:
      'To konto nie ma uprawnień administratora platformy. Uprawnienia organizacji (właściciel, administrator) nie dają dostępu do panelu systemowego.',
    unavailable: 'Serwer lub baza danych nie odpowiada.',
    systemHead: 'System',
    dataHead: 'Dane',
    app: 'Aplikacja',
    api: 'API',
    database: 'Baza',
    auth: 'Logowanie',
    migrations: 'Migracje',
    seeds: 'Dane startowe',
    ok: 'OK',
    connected: 'Połączono',
    disconnected: 'Brak połączenia',
    configured: 'Skonfigurowane',
    unconfigured: 'Nieskonfigurowane',
    current: 'Aktualne',
    missing: 'Brak',
    outdated: 'Nieaktualne',
    count: {
      organizations: 'Organizacje',
      users: 'Użytkownicy',
      customers: 'Klienci',
      estimations: 'Wyceny',
      quotes: 'Oferty',
      technicalFamilies: 'Produkty katalogu',
      commercialVariants: 'Warianty handlowe',
      assortmentItems: 'Pozycje hurtowni',
      manufacturers: 'Producenci',
    },
    search: 'Szukaj',
    name: 'Nazwa',
    slug: 'Slug',
    currency: 'Waluta',
    status: 'Status',
    active: 'Aktywna',
    inactive: 'Nieaktywna',
    owners: 'Właściciele',
    members: 'Użytkownicy',
    assortment: 'Asortyment',
    customers: 'Klienci',
    estimations: 'Wyceny',
    quotes: 'Oferty',
    newOrganization: 'Nowa hurtownia',
    create: 'Utwórz hurtownię',
    activate: 'Aktywuj',
    deactivate: 'Dezaktywuj',
    addMember: 'Dodaj istniejącego użytkownika',
    newAccount: 'Utwórz nowe konto',
    email: 'E-mail',
    password: 'Hasło (min. 12 znaków)',
    role: 'Rola',
    roles: { owner: 'Właściciel', admin: 'Administrator', sales: 'Handlowiec' },
    add: 'Dodaj',
    createAccount: 'Utwórz konto',
    platformAdmin: 'Administrator platformy',
    membership: 'Członkostwa',
    noMemberships: 'Brak członkostw.',
    save: 'Zapisz',
    memberActive: 'Aktywne',
    empty: 'Brak wyników.',
    kinds: 'Rodziny techniczne wg rodzaju',
    revisions: 'Rewizje techniczne',
    products: 'Produkty',
    openProduct: 'Szczegóły',
    technical: 'Parametry techniczne (rewizja niezmienna)',
    variants: 'Warianty handlowe',
    serverVersion: 'Serwer bazy',
    runtime: 'Środowisko',
    version: 'Wersja aplikacji',
    commit: 'Commit',
    saved: 'Zapisano.',
    error: 'Nie udało się: {{code}}',
  },
  en: {
    title: 'RoofCalc — system console',
    subtitle:
      'Platform operator. Wholesalers manage their own data separately.',
    back: 'Home',
    dashboard: 'Dashboard',
    organizations: 'Organizations',
    users: 'Users',
    catalogue: 'Catalogue',
    system: 'Database & system',
    loading: 'Loading…',
    noSession: 'Sign in with a platform administrator account.',
    signIn: 'Go to sign-in',
    forbidden:
      'This account is not a platform administrator. Organization roles (owner, admin) do not grant the system console.',
    unavailable: 'The server or database does not respond.',
    systemHead: 'System',
    dataHead: 'Data',
    app: 'Application',
    api: 'API',
    database: 'Database',
    auth: 'Sign-in',
    migrations: 'Migrations',
    seeds: 'Seed data',
    ok: 'OK',
    connected: 'Connected',
    disconnected: 'Not connected',
    configured: 'Configured',
    unconfigured: 'Not configured',
    current: 'Current',
    missing: 'Missing',
    outdated: 'Outdated',
    count: {
      organizations: 'Organizations',
      users: 'Users',
      customers: 'Customers',
      estimations: 'Estimates',
      quotes: 'Quotes',
      technicalFamilies: 'Catalogue products',
      commercialVariants: 'Commercial variants',
      assortmentItems: 'Wholesaler items',
      manufacturers: 'Manufacturers',
    },
    search: 'Search',
    name: 'Name',
    slug: 'Slug',
    currency: 'Currency',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    owners: 'Owners',
    members: 'Users',
    assortment: 'Assortment',
    customers: 'Customers',
    estimations: 'Estimates',
    quotes: 'Quotes',
    newOrganization: 'New wholesaler',
    create: 'Create wholesaler',
    activate: 'Activate',
    deactivate: 'Deactivate',
    addMember: 'Add an existing user',
    newAccount: 'Create a new account',
    email: 'Email',
    password: 'Password (12+ characters)',
    role: 'Role',
    roles: { owner: 'Owner', admin: 'Administrator', sales: 'Sales' },
    add: 'Add',
    createAccount: 'Create account',
    platformAdmin: 'Platform administrator',
    membership: 'Memberships',
    noMemberships: 'No memberships.',
    save: 'Save',
    memberActive: 'Active',
    empty: 'No results.',
    kinds: 'Technical families by kind',
    revisions: 'Technical revisions',
    products: 'Products',
    openProduct: 'Details',
    technical: 'Technical parameters (immutable revision)',
    variants: 'Commercial variants',
    serverVersion: 'Database server',
    runtime: 'Runtime',
    version: 'App version',
    commit: 'Commit',
    saved: 'Saved.',
    error: 'Failed: {{code}}',
  },
};
type Copy = (typeof COPY)['pl'];

const KIND_LABEL: Record<string, [string, string]> = {
  'roof-tile': ['Dachówki', 'Roof tiles'],
  'modular-sheet': ['Blachodachówki', 'Metal tile sheets'],
  'standing-seam': ['Blacha na rąbek', 'Standing seam'],
  membrane: ['Membrany', 'Membranes'],
  'timber-stock': ['Drewno', 'Timber'],
  'roof-tile-accessory': ['Akcesoria dachówkowe', 'Tile accessories'],
  'roof-drainage-component': ['Odwodnienie', 'Drainage'],
  'roof-window-component': ['Okna dachowe', 'Roof windows'],
  'roof-system-component': ['System dachu', 'Roof system'],
};

const errorCode = (error: unknown) =>
  error instanceof BusinessClientError ? error.code : 'unknown';

function StatusRow({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="p-status-row" data-good={good}>
      <span>{label}</span>
      <strong>
        <i aria-hidden="true" />
        {value}
      </strong>
    </div>
  );
}

function SystemRows({ system, m }: { system: PlatformSystem; m: Copy }) {
  const seeds = system.seeds ? Object.values(system.seeds) : [];
  const seedsCurrent =
    seeds.length > 0 && seeds.every((s) => s.state === 'current');
  return (
    <>
      <StatusRow label={m.app} value={m.ok} good />
      <StatusRow label={m.api} value={m.ok} good />
      <StatusRow
        label={m.database}
        value={system.database === 'connected' ? m.connected : m.disconnected}
        good={system.database === 'connected'}
      />
      <StatusRow
        label={m.auth}
        value={system.auth === 'configured' ? m.configured : m.unconfigured}
        good={system.auth === 'configured'}
      />
      {system.migrations && (
        <StatusRow
          label={m.migrations}
          value={`${system.migrations.applied} / ${system.migrations.expected}`}
          good={system.migrations.state === 'current'}
        />
      )}
      {system.seeds && (
        <StatusRow
          label={m.seeds}
          value={seedsCurrent ? m.current : m.outdated}
          good={seedsCurrent}
        />
      )}
    </>
  );
}

function Dashboard({ m }: { m: Copy }) {
  const overview = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: platformClient.overview,
  });
  if (overview.isPending) return <p>{m.loading}</p>;
  if (overview.isError) return <p role="alert">{m.unavailable}</p>;
  const { system, counts } = overview.data;
  const keys = [
    'organizations',
    'users',
    'customers',
    'estimations',
    'quotes',
    'technicalFamilies',
    'commercialVariants',
    'assortmentItems',
    'manufacturers',
  ] as const;
  return (
    <div className="p-dashboard" data-testid="platform-dashboard">
      <section className="p-card">
        <h2>{m.systemHead}</h2>
        <SystemRows system={system} m={m} />
      </section>
      <section className="p-card">
        <h2>{m.dataHead}</h2>
        <div className="p-counts">
          {keys.map((key) => (
            <div key={key} data-count={key}>
              <strong>{counts[key].toLocaleString()}</strong>
              <span>
                {m.count[key]}
                {key === 'organizations' &&
                  counts.activeOrganizations !== counts.organizations &&
                  ` · ${counts.activeOrganizations} ${m.active.toLowerCase()}`}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="p-search">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={label}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function useFeedback(m: Copy) {
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  return {
    message,
    ok: () => setMessage({ ok: true, text: m.saved }),
    fail: (error: unknown) =>
      setMessage({
        ok: false,
        text: m.error.replace('{{code}}', errorCode(error)),
      }),
    node: message ? (
      <p className="p-feedback" data-ok={message.ok} role="status">
        {message.text}
      </p>
    ) : null,
  };
}

function MemberForms({
  organization,
  m,
}: {
  organization: PlatformOrganization;
  m: Copy;
}) {
  const client = useQueryClient();
  const feedback = useFeedback(m);
  const refresh = () => client.invalidateQueries({ queryKey: ['platform'] });
  const add = useMutation({
    mutationFn: platformClient.setMembership,
    onSuccess: () => {
      feedback.ok();
      void refresh();
    },
    onError: feedback.fail,
  });
  const create = useMutation({
    mutationFn: platformClient.createUser,
    onSuccess: () => {
      feedback.ok();
      void refresh();
    },
    onError: feedback.fail,
  });
  const roleSelect = (name: string) => (
    <label>
      <span>{m.role}</span>
      <select name={name} defaultValue="owner">
        {(['owner', 'admin', 'sales'] as const).map((role) => (
          <option key={role} value={role}>
            {m.roles[role]}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="p-member-forms">
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          add.mutate({
            organizationId: organization.id,
            email: String(form.get('email')),
            role: String(form.get('role')) as Role,
            active: true,
          });
        }}
      >
        <h4>{m.addMember}</h4>
        <label>
          <span>{m.email}</span>
          <input name="email" type="email" required />
        </label>
        {roleSelect('role')}
        <button type="submit" className="p-button" disabled={add.isPending}>
          {m.add}
        </button>
      </form>
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          create.mutate({
            organizationId: organization.id,
            name: String(form.get('name')),
            email: String(form.get('email')),
            password: String(form.get('password')),
            role: String(form.get('role')) as Role,
          });
          event.currentTarget.reset();
        }}
      >
        <h4>{m.newAccount}</h4>
        <label>
          <span>{m.name}</span>
          <input name="name" required />
        </label>
        <label>
          <span>{m.email}</span>
          <input name="email" type="email" required />
        </label>
        <label>
          <span>{m.password}</span>
          <input
            name="password"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
        </label>
        {roleSelect('role')}
        <button type="submit" className="p-button" disabled={create.isPending}>
          {m.createAccount}
        </button>
      </form>
      {feedback.node}
    </div>
  );
}

function Organizations({ m }: { m: Copy }) {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string>();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [currency, setCurrency] = useState('PLN');
  const client = useQueryClient();
  const feedback = useFeedback(m);
  const list = useQuery({
    queryKey: ['platform', 'organizations', q],
    queryFn: () => platformClient.organizations(q),
  });
  const members = useQuery({
    queryKey: ['platform', 'users', ''],
    queryFn: () => platformClient.users(),
    enabled: !!openId,
  });
  const create = useMutation({
    mutationFn: platformClient.createOrganization,
    onSuccess: ({ item }) => {
      feedback.ok();
      setName('');
      setSlug('');
      setSlugTouched(false);
      setOpenId(item.id);
      void client.invalidateQueries({ queryKey: ['platform'] });
    },
    onError: feedback.fail,
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      platformClient.setOrganizationActive(id, active),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['platform'] }),
    onError: feedback.fail,
  });
  const open = list.data?.items.find((item) => item.id === openId);
  return (
    <div className="p-split" data-testid="platform-organizations">
      <section className="p-card p-grow">
        <header className="p-toolbar">
          <SearchBox value={q} onChange={setQ} label={m.search} />
        </header>
        {list.isPending ? (
          <p>{m.loading}</p>
        ) : list.isError ? (
          <p role="alert">{m.unavailable}</p>
        ) : list.data.items.length === 0 ? (
          <p>{m.empty}</p>
        ) : (
          <table className="p-table">
            <thead>
              <tr>
                <th>{m.name}</th>
                <th>{m.status}</th>
                <th>{m.owners}</th>
                <th className="n">{m.members}</th>
                <th className="n">{m.assortment}</th>
                <th className="n">{m.customers}</th>
                <th className="n">{m.estimations}</th>
                <th className="n">{m.quotes}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((org) => (
                <tr
                  key={org.id}
                  aria-selected={org.id === openId}
                  onClick={() => setOpenId(org.id)}
                >
                  <td>
                    <button type="button" className="p-row-link">
                      <strong>{org.name}</strong>
                      <small>
                        {org.slug} · {org.currencyCode}
                      </small>
                    </button>
                  </td>
                  <td>
                    <span className="p-pill" data-active={org.active}>
                      {org.active ? m.active : m.inactive}
                    </span>
                  </td>
                  <td>
                    {org.owners.map((owner) => owner.name).join(', ') || '—'}
                  </td>
                  <td className="n">{org.members}</td>
                  <td className="n">{org.assortmentItems}</td>
                  <td className="n">{org.customers}</td>
                  <td className="n">{org.estimations}</td>
                  <td className="n">{org.quotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <aside className="p-side">
        {open ? (
          <section
            className="p-card"
            data-testid="platform-organization-detail"
          >
            <h2>{open.name}</h2>
            <p className="p-muted">
              {open.slug} · {open.currencyCode}
            </p>
            <button
              type="button"
              className="p-button is-quiet"
              onClick={() =>
                toggle.mutate({ id: open.id, active: !open.active })
              }
            >
              {open.active ? m.deactivate : m.activate}
            </button>
            <h3>{m.members}</h3>
            <ul className="p-list">
              {(members.data?.items ?? [])
                .flatMap((user) =>
                  user.memberships
                    .filter((item) => item.organizationId === open.id)
                    .map((item) => ({ user, item })),
                )
                .map(({ user, item }) => (
                  <li key={user.id}>
                    <strong>{user.name}</strong>
                    <small>
                      {user.email} · {m.roles[item.role]}
                      {item.active ? '' : ` · ${m.inactive}`}
                    </small>
                  </li>
                ))}
            </ul>
            <MemberForms organization={open} m={m} />
          </section>
        ) : (
          <form
            className="p-card"
            data-testid="platform-create-organization"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({ name, slug, currencyCode: currency });
            }}
          >
            <h2>{m.newOrganization}</h2>
            <label>
              <span>{m.name}</span>
              <input
                value={name}
                required
                minLength={2}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugTouched)
                    setSlug(suggestOrganizationSlug(event.target.value));
                }}
              />
            </label>
            <label>
              <span>{m.slug}</span>
              <input
                value={slug}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
              />
            </label>
            <label>
              <span>{m.currency}</span>
              <input
                value={currency}
                maxLength={3}
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
              />
            </label>
            <button
              type="submit"
              className="p-button is-primary"
              disabled={create.isPending}
            >
              {m.create}
            </button>
            {feedback.node}
          </form>
        )}
        {open && (
          <button
            type="button"
            className="p-link"
            onClick={() => setOpenId(undefined)}
          >
            + {m.newOrganization}
          </button>
        )}
      </aside>
    </div>
  );
}

function UserDetail({ user, m }: { user: PlatformUser; m: Copy }) {
  const client = useQueryClient();
  const feedback = useFeedback(m);
  const save = useMutation({
    mutationFn: platformClient.setMembership,
    onSuccess: () => {
      feedback.ok();
      void client.invalidateQueries({ queryKey: ['platform'] });
    },
    onError: feedback.fail,
  });
  return (
    <section className="p-card" data-testid="platform-user-detail">
      <h2>{user.name}</h2>
      <p className="p-muted">{user.email}</p>
      {user.platformAdmin && (
        <p className="p-pill is-admin">
          <ShieldCheck size={14} aria-hidden="true" /> {m.platformAdmin}
        </p>
      )}
      <h3>{m.membership}</h3>
      {user.memberships.length === 0 && <p>{m.noMemberships}</p>}
      {user.memberships.map((membership) => (
        <form
          key={membership.organizationId}
          className="p-membership"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            save.mutate({
              organizationId: membership.organizationId,
              email: user.email,
              role: String(form.get('role')) as Role,
              active: form.get('active') === 'on',
            });
          }}
        >
          <strong>{membership.organizationName}</strong>
          <select
            name="role"
            defaultValue={membership.role}
            aria-label={m.role}
          >
            {(['owner', 'admin', 'sales'] as const).map((role) => (
              <option key={role} value={role}>
                {m.roles[role]}
              </option>
            ))}
          </select>
          <label className="p-check">
            <input
              type="checkbox"
              name="active"
              defaultChecked={membership.active}
            />
            {m.memberActive}
          </label>
          <button type="submit" className="p-button" disabled={save.isPending}>
            {m.save}
          </button>
        </form>
      ))}
      {feedback.node}
    </section>
  );
}

function UsersSection({ m }: { m: Copy }) {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string>();
  const list = useQuery({
    queryKey: ['platform', 'users', q],
    queryFn: () => platformClient.users(q),
  });
  const open = list.data?.items.find((user) => user.id === openId);
  return (
    <div className="p-split" data-testid="platform-users">
      <section className="p-card p-grow">
        <header className="p-toolbar">
          <SearchBox value={q} onChange={setQ} label={m.search} />
        </header>
        {list.isPending ? (
          <p>{m.loading}</p>
        ) : list.isError ? (
          <p role="alert">{m.unavailable}</p>
        ) : list.data.items.length === 0 ? (
          <p>{m.empty}</p>
        ) : (
          <table className="p-table">
            <thead>
              <tr>
                <th>{m.name}</th>
                <th>{m.organizations}</th>
                <th>{m.role}</th>
                <th>{m.status}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((user) => (
                <tr
                  key={user.id}
                  aria-selected={user.id === openId}
                  onClick={() => setOpenId(user.id)}
                >
                  <td>
                    <button type="button" className="p-row-link">
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </button>
                  </td>
                  <td>
                    {user.memberships
                      .map((item) => item.organizationName)
                      .join(', ') || '—'}
                  </td>
                  <td>
                    {[
                      ...new Set(
                        user.memberships.map((item) => m.roles[item.role]),
                      ),
                    ].join(', ') || '—'}
                  </td>
                  <td>
                    {user.platformAdmin ? (
                      <span className="p-pill is-admin">{m.platformAdmin}</span>
                    ) : user.memberships.some((item) => item.active) ? (
                      <span className="p-pill" data-active="true">
                        {m.active}
                      </span>
                    ) : (
                      <span className="p-pill" data-active="false">
                        {m.inactive}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <aside className="p-side">
        {open && <UserDetail user={open} m={m} />}
      </aside>
    </div>
  );
}

function Catalogue({ m, pl }: { m: Copy; pl: boolean }) {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string>();
  const status = useQuery({
    queryKey: ['platform', 'catalogue'],
    queryFn: platformClient.catalogue,
  });
  const products = useQuery({
    queryKey: ['platform', 'catalogue-search', q],
    queryFn: ({ signal }) =>
      catalogClient.searchProducts({ q: q || undefined, limit: 50 }, signal),
  });
  const detail = useQuery({
    queryKey: ['platform', 'catalogue-product', openId],
    queryFn: ({ signal }) => catalogClient.getProduct(openId!, signal),
    enabled: !!openId,
  });
  const kind = (value: string) => KIND_LABEL[value]?.[pl ? 0 : 1] ?? value;
  return (
    <div className="p-split" data-testid="platform-catalogue">
      <div className="p-grow p-stack">
        {status.data && (
          <section className="p-card">
            <div className="p-counts is-compact">
              <div>
                <strong>{status.data.manufacturers}</strong>
                <span>{m.count.manufacturers}</span>
              </div>
              <div>
                <strong>{status.data.technicalFamilies}</strong>
                <span>{m.count.technicalFamilies}</span>
              </div>
              <div>
                <strong>{status.data.revisions}</strong>
                <span>{m.revisions}</span>
              </div>
              <div>
                <strong>{status.data.commercialVariants}</strong>
                <span>{m.count.commercialVariants}</span>
              </div>
            </div>
            <h3>{m.kinds}</h3>
            <ul className="p-kinds">
              {status.data.byKind.map((row) => (
                <li key={row.kind}>
                  <span>{kind(row.kind)}</span>
                  <strong>{row.families}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="p-card">
          <header className="p-toolbar">
            <h2>{m.products}</h2>
            <SearchBox value={q} onChange={setQ} label={m.search} />
          </header>
          <table className="p-table">
            <tbody>
              {(products.data?.items ?? []).map((product) => (
                <tr
                  key={product.id}
                  aria-selected={product.id === openId}
                  onClick={() => setOpenId(product.id)}
                >
                  <td>
                    <button type="button" className="p-row-link">
                      <strong>{product.name}</strong>
                      <small>{product.manufacturer.name}</small>
                    </button>
                  </td>
                  <td>{kind(product.kind)}</td>
                  <td className="n">{product.variantCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <aside className="p-side">
        {detail.data && (
          <section className="p-card" data-testid="platform-product-detail">
            <h2>{detail.data.product.name}</h2>
            <p className="p-muted">
              {detail.data.manufacturer.name} ·{' '}
              {kind(detail.data.product.coveringKind)} · rev.{' '}
              {detail.data.currentRevision.revisionCode}
            </p>
            <h3>{m.technical}</h3>
            <dl className="p-spec">
              {Object.entries(detail.data.currentRevision.technicalSpec)
                .filter(([, value]) => typeof value !== 'object')
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
            <h3>{m.variants}</h3>
            <ul className="p-list">
              {detail.data.variants.map((variant) => (
                <li key={variant.id}>
                  <strong>{variant.name}</strong>
                  {variant.sku && <small>{variant.sku}</small>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function SystemSection({ m }: { m: Copy }) {
  const system = useQuery({
    queryKey: ['platform', 'system'],
    queryFn: platformClient.system,
  });
  if (system.isPending) return <p>{m.loading}</p>;
  if (system.isError) return <p role="alert">{m.unavailable}</p>;
  const data = system.data;
  return (
    <div className="p-dashboard" data-testid="platform-system">
      <section className="p-card">
        <h2>{m.systemHead}</h2>
        <SystemRows system={data} m={m} />
        {data.serverVersion && (
          <StatusRow label={m.serverVersion} value={data.serverVersion} good />
        )}
        <StatusRow label={m.runtime} value={data.runtime} good />
        <StatusRow label={m.version} value={data.appVersion} good />
        {data.gitSha && <StatusRow label={m.commit} value={data.gitSha} good />}
      </section>
      {data.seeds && (
        <section className="p-card">
          <h2>{m.seeds}</h2>
          {Object.entries(data.seeds).map(([category, seed]) => (
            <StatusRow
              key={category}
              label={category}
              value={`${m[seed.state]} · ${seed.current} / ${seed.expected}`}
              good={seed.state === 'current'}
            />
          ))}
        </section>
      )}
    </div>
  );
}

const NAV: Array<[Section, typeof LayoutDashboard]> = [
  ['dashboard', LayoutDashboard],
  ['organizations', Building2],
  ['users', Users],
  ['catalogue', Boxes],
  ['system', Database],
];

/**
 * RoofCalc system console — operator level, separate from any wholesaler's
 * own administration. Visible only to an active platform admin.
 */
export function PlatformConsole({
  onHome,
  onSignIn,
}: {
  onHome: () => void;
  onSignIn: () => void;
}) {
  const { i18n } = useTranslation();
  const pl = i18n.language.startsWith('pl');
  const m = pl ? COPY.pl : COPY.en;
  const [section, setSection] = useState<Section>('dashboard');
  const session = useQuery({
    queryKey: ['business', 'session'],
    queryFn: sessionClient.session,
    retry: false,
  });
  const body: ReactNode = useMemo(() => {
    if (session.isPending) return <p>{m.loading}</p>;
    if (session.isError)
      return (
        <div className="p-card p-gate">
          <p>
            {errorCode(session.error) === 'authentication-required'
              ? m.noSession
              : m.unavailable}
          </p>
          <button
            type="button"
            className="p-button is-primary"
            onClick={onSignIn}
          >
            {m.signIn}
          </button>
        </div>
      );
    if (!session.data.platformAdmin)
      return (
        <div className="p-card p-gate" data-testid="platform-forbidden">
          <p>{m.forbidden}</p>
        </div>
      );
    if (section === 'organizations') return <Organizations m={m} />;
    if (section === 'users') return <UsersSection m={m} />;
    if (section === 'catalogue') return <Catalogue m={m} pl={pl} />;
    if (section === 'system') return <SystemSection m={m} />;
    return <Dashboard m={m} />;
  }, [
    session.isPending,
    session.isError,
    session.error,
    session.data,
    section,
    m,
    pl,
    onSignIn,
  ]);
  const allowed = !!session.data?.platformAdmin;
  return (
    <div className="p-console" data-testid="platform-console">
      <aside className="p-nav">
        <button type="button" className="p-back" onClick={onHome}>
          <ArrowLeft size={16} aria-hidden="true" />
          {m.back}
        </button>
        <div className="p-brand">
          <ShieldCheck size={20} aria-hidden="true" />
          <span>{m.title}</span>
        </div>
        {allowed && (
          <nav aria-label={m.title}>
            {NAV.map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                data-section={key}
                aria-current={section === key ? 'page' : undefined}
                onClick={() => setSection(key)}
              >
                <Icon size={17} aria-hidden="true" />
                {m[key]}
              </button>
            ))}
          </nav>
        )}
        {session.data && (
          <p className="p-user">
            {session.data.user.name}
            <small>{session.data.user.email}</small>
          </p>
        )}
      </aside>
      <main className="p-main">
        <header className="p-header">
          <h1>{allowed ? m[section] : m.title}</h1>
          <p>{m.subtitle}</p>
        </header>
        {body}
      </main>
    </div>
  );
}
