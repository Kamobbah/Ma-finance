import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Chip, NativeSelect, PageHeader, Panel } from "@/components/kit";
import { setPrefs, useData, usePrefs } from "@/lib/store";
import { accountBalance, balanceSeries } from "@/lib/analytics";
import { money, round2, todayIso } from "@/lib/format";
import { yearOptions } from "@/lib/ui";
import type { Account, AccountType } from "@/lib/types";

const SECTIONS: { type: AccountType; title: string; sub: string }[] = [
  { type: "main", title: "Compte principal", sub: "Votre compte courant Revolut" },
  { type: "pocket", title: "Pockets", sub: "Sous-comptes du compte principal, suivis séparément" },
  { type: "savings", title: "Épargne", sub: "Compte d'épargne rémunéré" },
  { type: "other", title: "Autres devises", sub: "Comptes en USD, JPY…" },
];

function AccountCard({ acc, year }: { acc: Account; year: number }) {
  const data = useData();
  const today = todayIso();
  const to = `${year}-12-31` < today ? `${year}-12-31` : today;
  const series = useMemo(() => balanceSeries(acc, data.transactions, `${year}-01-01`, to < `${year}-01-01` ? `${year}-01-01` : to), [acc, data.transactions, year, to]);
  const yearTx = data.transactions.filter((t) => t.accountId === acc.id && t.date.startsWith(String(year)));
  const tIn = round2(yearTx.filter((t) => t.type === "transfer_in").reduce((s, t) => s + t.amount, 0));
  const tOut = round2(yearTx.filter((t) => t.type === "transfer_out").reduce((s, t) => s - t.amount, 0));
  const spent = round2(yearTx.filter((t) => t.type === "expense").reduce((s, t) => s - t.amount, 0));
  const bal = accountBalance(acc, data.transactions, today);
  return (
    <Link
      to={`/comptes/${acc.id}`}
      data-testid={`account-card-${acc.id}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-5 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.06)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_34px_-10px_rgba(15,23,42,0.14)] animate-rise"
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: acc.color }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{acc.name}</p>
          <p className="text-xs text-slate-500">
            {yearTx.length} opérations en {year}
            {acc.archived && " · archivé"}
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </div>
      <p data-testid={`account-card-balance-${acc.id}`} className="mt-3 text-2xl font-extrabold tabular text-slate-900">
        {money(bal, acc.currency)}
      </p>
      <div className="-mx-1 mt-2 h-14">
        {series.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id={`g-${acc.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={acc.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={acc.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Area dataKey="balance" type="stepAfter" stroke={acc.color} strokeWidth={2} fill={`url(#g-${acc.id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip className="bg-blue-50 text-blue-800 ring-blue-200">↓ {money(tIn, acc.currency)}</Chip>
        <Chip className="bg-indigo-50 text-indigo-800 ring-indigo-200">↑ {money(tOut, acc.currency)}</Chip>
        {spent > 0 && <Chip className="bg-rose-50 text-rose-800 ring-rose-200">Dépenses {money(spent, acc.currency)}</Chip>}
      </div>
    </Link>
  );
}

export default function Accounts() {
  const data = useData();
  const { year } = usePrefs();
  return (
    <div>
      <PageHeader
        eyebrow="Vue par compte"
        title="Comptes & Pockets"
        subtitle="Chaque compte et chaque Pocket avec son solde, son évolution et ses transferts. Cliquez sur une carte pour le détail."
        actions={<NativeSelect testid="accounts-year-select" ariaLabel="Année" value={String(year)} onChange={(v) => setPrefs({ year: Number(v) })} options={yearOptions(data)} />}
      />
      <p className="mb-5 flex flex-wrap gap-3 text-xs text-slate-500">
        <span>↓ transferts entrants</span>
        <span>↑ transferts sortants</span>
      </p>
      {SECTIONS.map((sec) => {
        const accs = data.accounts.filter((a) => a.type === sec.type);
        if (!accs.length) return null;
        return (
          <section key={sec.type} className="mb-8" data-testid={`accounts-section-${sec.type}`}>
            <div className="mb-3">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{sec.title}</h2>
              <p className="text-xs text-slate-500">{sec.sub}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {accs.map((a) => (
                <AccountCard key={a.id} acc={a} year={year} />
              ))}
            </div>
          </section>
        );
      })}
      {data.accounts.length === 0 && (
        <Panel>
          <p className="text-sm text-slate-500">Aucun compte. Créez-en un depuis la page Données.</p>
        </Panel>
      )}
    </div>
  );
}
