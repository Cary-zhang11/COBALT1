"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  avatar: string | null;
  mobile: string | null;
  group: string | null;
  permissions: any;
  accountStatus: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500",
  inactive: "bg-gray-400",
  disabled: "bg-red-500",
  locked: "bg-yellow-500",
};

const STATUS_LABELS: Record<string, string> = {
  active: "正常",
  inactive: "未激活",
  disabled: "已禁用",
  locked: "已锁定",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: authLoading } = useAuthStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (keyword) params.set("keyword", keyword);
      if (groupFilter) params.set("group", groupFilter);
      if (statusFilter) params.set("accountStatus", statusFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.status === 403) {
        router.push("/");
        return;
      }
      if (!res.ok) throw new Error("获取用户列表失败");
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, groupFilter, statusFilter, router]);

  useEffect(() => {
    if (!authLoading) fetchUsers();
  }, [authLoading, fetchUsers]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.id)));
    }
  };

  const batchUpdate = async (updates: Record<string, any>) => {
    if (selected.size === 0) return;
    try {
      const res = await fetch("/api/admin/users/batch-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected), ...updates }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "批量更新失败");
        return;
      }
      setSelected(new Set());
      fetchUsers();
    } catch {
      alert("批量更新失败");
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">用户管理</h1>

      {/* 搜索和筛选 */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="搜索用户名、手机号、邮箱..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm w-64 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={groupFilter}
          onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm outline-none"
        >
          <option value="">全部用户组</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm outline-none"
        >
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="inactive">未激活</option>
          <option value="disabled">已禁用</option>
          <option value="locked">已锁定</option>
        </select>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selected.size === users.length && users.length > 0}
                  onChange={selectAll}
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">用户名</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">邮箱</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">用户组</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">状态</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">注册时间</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                  />
                </td>
                <td className="px-4 py-3">{u.username || u.name || "-"}</td>
                <td className="px-4 py-3 text-gray-500">{u.email || "-"}</td>
                <td className="px-4 py-3">{u.group || "-"}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[u.accountStatus] || "bg-gray-400"}`} />
                    {STATUS_LABELS[u.accountStatus] || u.accountStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  暂无用户数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 批量操作 + 分页 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-gray-500">已选 {selected.size} 项</span>
              <button
                onClick={() => batchUpdate({ accountStatus: "active" })}
                className="px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded border hover:bg-green-100"
              >
                启用
              </button>
              <button
                onClick={() => batchUpdate({ accountStatus: "disabled" })}
                className="px-3 py-1.5 text-xs bg-red-50 text-red-700 rounded border hover:bg-red-100"
              >
                禁用
              </button>
              <button
                onClick={() => batchUpdate({ accountStatus: "locked" })}
                className="px-3 py-1.5 text-xs bg-yellow-50 text-yellow-700 rounded border hover:bg-yellow-100"
              >
                锁定
              </button>
            </>
          )}
        </div>
        <div className="flex gap-2 items-center text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 border rounded disabled:opacity-50"
          >
            上一页
          </button>
          <span>{page} / {totalPages || 1}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 border rounded disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
