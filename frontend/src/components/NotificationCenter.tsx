import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Paginated } from "../lib/admissions";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/Dialog";
import { Button } from "./ui/Button";
import { ErrorMessage } from "./Form";
import { Pagination } from "./Pagination";
interface Notice {
  id: string;
  title: string;
  link: string;
  created_at: string;
  read_at: string | null;
}
export function NotificationCenter() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [confirmClear, setConfirmClear] = useState(false);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const count = useQuery({
    queryKey: ["notification-count", user?.id],
    queryFn: () =>
      apiRequest<{ unread: number }>("/accounts/notifications/count/"),
    refetchInterval: 30000,
  });
  const list = useQuery({
    queryKey: ["notifications", user?.id, page],
    enabled: open,
    queryFn: () =>
      apiRequest<Paginated<Notice>>(`/accounts/notifications/?page=${page}`),
  });
  const update = useMutation({
    mutationFn: ({ path, method }: { path: string; method: string }) =>
      apiRequest(`/accounts/notifications/${path}`, { method }),
    onSuccess: async () => {
      setPage(1);
      setConfirmClear(false);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["notifications"] }),
        cache.invalidateQueries({ queryKey: ["notification-count"] }),
      ]);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${count.data?.unread ? `, ${count.data.unread} unread` : ""}`}
        >
          <Bell aria-hidden="true" />
          {!!count.data?.unread && (
            <span className="absolute -right-1 -top-1 rounded-full bg-brand px-1.5 text-xs text-white">
              {count.data.unread > 99 ? "99+" : count.data.unread}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Notifications</DialogTitle>
        <DialogDescription>{count.data?.unread ?? 0} unread</DialogDescription>
        <div className="my-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={update.isPending || !count.data?.unread}
            onClick={() => update.mutate({ path: "read-all/", method: "POST" })}
          >
            Mark All Read
          </Button>
          <Button
            variant="ghost"
            disabled={update.isPending || !list.data?.count}
            onClick={() =>
              update.mutate({ path: "clear-read/", method: "DELETE" })
            }
          >
            Delete Read
          </Button>
        </div>
        {confirmClear ? (
          <div className="mb-4 rounded-xl border border-line p-4">
            <p className="mb-3 font-semibold">Delete all notifications?</p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({ path: "clear/", method: "DELETE" })
                }
              >
                Delete All
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="mb-3"
            disabled={!list.data?.count}
            onClick={() => setConfirmClear(true)}
          >
            Delete All Notifications
          </Button>
        )}
        <ErrorMessage error={list.error || count.error || update.error} />
        {list.isPending && <p role="status">Loading notifications…</p>}
        {list.data?.count === 0 && (
          <p className="py-8 text-center text-muted">No notifications.</p>
        )}
        <ul className="divide-y divide-line">
          {list.data?.results.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 rounded-lg p-3 ${n.read_at ? "" : "bg-brand-soft"}`}
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={n.link}
                  className="font-semibold"
                  onClick={() => {
                    update.mutate({ path: `${n.id}/read/`, method: "POST" });
                    setOpen(false);
                  }}
                >
                  {n.title}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  {new Date(n.created_at).toLocaleString()}
                </p>
                {!n.read_at && (
                  <button
                    className="mt-2 text-xs font-semibold text-brand"
                    onClick={() =>
                      update.mutate({ path: `${n.id}/read/`, method: "POST" })
                    }
                  >
                    Mark Read
                  </button>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete notification: ${n.title}`}
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({ path: `${n.id}/`, method: "DELETE" })
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        {list.data && (
          <Pagination count={list.data.count} page={page} onChange={setPage} />
        )}
      </DialogContent>
    </Dialog>
  );
}
