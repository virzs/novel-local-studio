import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  getSettings,
  updateSetting,
  listDatabaseTables,
  getDatabaseTableSchema,
  getDatabaseTableRows,
  type DbTableSchemaResponse,
  type DbTableRowsResponse,
} from '../../api';

const PAGE_SIZE = 50;
const DEV_DB_VIEWER_KEY = 'dev.db_viewer_enabled';

export function DatabaseViewerPage() {
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [schema, setSchema] = useState<DbTableSchemaResponse | null>(null);
  const [rowsData, setRowsData] = useState<DbTableRowsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offset = rowsData?.pagination.offset ?? 0;

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await getSettings();
        const isEnabled = data.settings[DEV_DB_VIEWER_KEY] === '1' || data.settings[DEV_DB_VIEWER_KEY] === 'true';
        setEnabled(isEnabled);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setTables([]);
      setSelectedTable('');
      setSchema(null);
      setRowsData(null);
      return;
    }

    async function loadTables() {
      setLoadingTables(true);
      try {
        const data = await listDatabaseTables();
        setTables(data.tables ?? []);
        setSelectedTable((current) => (current && data.tables.includes(current) ? current : (data.tables[0] ?? '')));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载表失败');
      } finally {
        setLoadingTables(false);
      }
    }

    void loadTables();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !selectedTable) {
      setSchema(null);
      setRowsData(null);
      return;
    }

    async function loadTableDetail() {
      setLoadingRows(true);
      try {
        const [schemaData, rows] = await Promise.all([
          getDatabaseTableSchema(selectedTable),
          getDatabaseTableRows(selectedTable, PAGE_SIZE, 0),
        ]);
        setSchema(schemaData);
        setRowsData(rows);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载表数据失败');
      } finally {
        setLoadingRows(false);
      }
    }

    void loadTableDetail();
  }, [enabled, selectedTable]);

  async function handleToggle(next: boolean) {
    setSaving(true);
    try {
      await updateSetting(DEV_DB_VIEWER_KEY, next ? '1' : '0');
      setEnabled(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败');
    } finally {
      setSaving(false);
    }
  }

  async function loadPage(nextOffset: number) {
    if (!selectedTable) return;
    setLoadingRows(true);
    try {
      const rows = await getDatabaseTableRows(selectedTable, PAGE_SIZE, nextOffset);
      setRowsData(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载分页失败');
    } finally {
      setLoadingRows(false);
    }
  }

  const columnNames = useMemo(() => schema?.columns.map((column) => column.name) ?? [], [schema]);

  if (!import.meta.env.DEV) {
    return <p className="text-muted-foreground text-sm">仅开发模式可用。</p>;
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg text-foreground">数据库查看器</h2>
        <p className="text-sm text-muted-foreground">
          仅开发模式可用。默认只读，敏感字段会自动脱敏。
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => void handleToggle(!enabled)} disabled={saving}>
          {saving ? '保存中…' : enabled ? '关闭数据库查看' : '开启数据库查看'}
        </Button>
        <span className={`text-sm ${enabled ? 'text-success' : 'text-muted-foreground'}`}>
          {enabled ? '已启用' : '未启用'}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!enabled ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-sm text-muted-foreground">
          开启后可查看数据库表结构与分页数据。
        </div>
      ) : (
        <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-6 min-h-[480px]">
          <div className="border border-border rounded-sm bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs tracking-widest uppercase text-muted-foreground">
              数据表
            </div>
            <div className="max-h-[560px] overflow-y-auto p-2">
              {loadingTables ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">加载中…</p>
              ) : tables.length === 0 ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">暂无可查看数据表</p>
              ) : (
                tables.map((table) => (
                  <button
                    key={table}
                    type="button"
                    onClick={() => setSelectedTable(table)}
                    className={[
                      'w-full text-left rounded-sm px-3 py-2 text-sm transition-colors',
                      table === selectedTable
                        ? 'bg-primary/10 text-foreground border border-primary/20'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent',
                    ].join(' ')}
                  >
                    {table}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4 min-w-0">
            <div className="border border-border rounded-sm bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm text-foreground">{selectedTable || '未选择数据表'}</h3>
                  <p className="text-xs text-muted-foreground">
                    {rowsData ? `共 ${rowsData.pagination.total} 行` : '请选择左侧数据表'}
                  </p>
                </div>
                {rowsData && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loadingRows || offset === 0}
                      onClick={() => void loadPage(Math.max(0, offset - PAGE_SIZE))}
                    >
                      上一页
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loadingRows || !rowsData.pagination.hasMore}
                      onClick={() => void loadPage(offset + PAGE_SIZE)}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-b border-border">
                <div className="flex flex-wrap gap-2">
                  {(schema?.columns ?? []).map((column) => (
                    <span
                      key={column.name}
                      className="text-xs rounded-sm border border-border px-2 py-1 text-muted-foreground"
                    >
                      {column.name}
                      <span className="ml-1 font-mono">{column.type || 'TEXT'}</span>
                      {column.primaryKey ? ' · PK' : ''}
                      {column.masked ? ' · MASKED' : ''}
                    </span>
                  ))}
                </div>
              </div>

              <div className="overflow-auto max-h-[420px]">
                {loadingRows ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">加载中…</div>
                ) : !rowsData || columnNames.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">暂无数据</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="border-b border-border">
                        {columnNames.map((name) => (
                          <th key={name} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowsData.rows.map((row, index) => (
                        <tr key={index} className="border-b border-border/60 align-top">
                          {columnNames.map((name) => (
                            <td key={name} className="px-3 py-2 text-foreground whitespace-pre-wrap break-all font-mono text-xs">
                              {row[name] == null ? <span className="text-muted-foreground">null</span> : String(row[name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
