import type { DashboardKit } from '../../../../shared/types';
import { Card } from '../../components';
import { formatCost } from '../../format';

function costTotal(kit: DashboardKit): number {
  return Object.values(kit.cost).reduce((sum, amount) => sum + amount, 0);
}

export function KitTable({ kits }: { kits: DashboardKit[] }) {
  const rows = [...kits].sort((a, b) => costTotal(b) - costTotal(a) || b.started - a.started);
  return (
    <Card id="by-kit" title="By kit" className="span-5">
      {rows.length === 0 && <p className="quiet">No kit in the catalog yet.</p>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Kit</th>
                <th scope="col" className="num">
                  Started
                </th>
                <th scope="col" className="num">
                  Finished
                </th>
                <th scope="col" className="num">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((kit) => (
                <tr key={kit.slug ?? 'other'}>
                  <td>
                    {kit.label ?? 'Other'}
                    {kit.slug && <span className="cell-sub">{kit.slug}</span>}
                  </td>
                  <td className="num">{kit.started}</td>
                  <td className="num">{kit.completed}</td>
                  <td className="num">{formatCost(kit.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
