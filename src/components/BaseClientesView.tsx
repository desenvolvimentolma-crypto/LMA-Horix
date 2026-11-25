import { useMemo, useState } from 'react';
import { Phone, Search } from 'lucide-react';
import type { ClientCatalogEntry } from '../types/cobranca';

interface BaseClientesViewProps {
  catalog: ClientCatalogEntry[];
}

export function BaseClientesView({ catalog }: BaseClientesViewProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) =>
        c.cliente.toLowerCase().includes(q) ||
        c.patrimonios.some((p) => p.toLowerCase().includes(q)) ||
        c.ultimoNomeContato.toLowerCase().includes(q) ||
        c.ultimaEmpresa.toLowerCase().includes(q)
    );
  }, [catalog, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#10203A]">
            Base de Clientes e Patrimônios
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Histórico consolidado automaticamente conforme a Recepção preenche os patrimônios e contatos. Usado para sugerir preenchimento rápido nas próximas planilhas.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, patrimônio ou contato..."
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#10203A] focus:outline-none focus:ring-2 focus:ring-[#10203A]/15"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            Nenhum cliente catalogado ainda. Importe uma planilha ou preencha registros na Recepção.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#10203A] text-white border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Empresa</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Patrimônios</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Último Contato</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Telefone</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">E-mail</th>
                  <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Fichas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((item) => (
                  <tr key={item.cliente} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{item.cliente}</td>
                    <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                      {item.ultimaEmpresa}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-900 whitespace-nowrap">
                      {item.patrimonios.length > 0 ? item.patrimonios.join(' · ') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap">
                      {item.ultimoNomeContato || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                      {item.ultimoTelefoneContato ? (
                        <a
                          href={`tel:${item.ultimoTelefoneContato.replace(/\D/g, '')}`}
                          className="inline-flex items-center gap-1.5 text-blue-700 hover:underline"
                        >
                          <Phone className="h-3 w-3" aria-hidden="true" />
                          {item.ultimoTelefoneContato}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {item.ultimoEmailContato || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {item.totalRegistros}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
