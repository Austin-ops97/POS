"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Employee = { id: string; name: string; preferredName?: string | null; jobTitle?: string | null };
type Conversation = { id: string; name: string; type: string; unreadCount: number; lastMessage?: { body: string } | null };
type Message = { id: string; body: string; createdAt: string; sender: { id: string; name: string; preferredName?: string | null } };

export function ConnectionsInbox({ currentEmployeeId }: { currentEmployeeId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [showPeople, setShowPeople] = useState(false);
  const [error, setError] = useState("");

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/connections/conversations", { cache: "no-store" });
    if (!response.ok) return setError("Could not load conversations");
    const rows = await response.json() as Conversation[];
    setConversations(rows);
    setActiveId((current) => current || rows[0]?.id || null);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const response = await fetch(`/api/connections/conversations/${id}/messages`, { cache: "no-store" });
    if (response.ok) setMessages(await response.json());
  }, []);

  useEffect(() => {
    void loadConversations();
    void fetch("/api/connections/employees", { cache: "no-store" }).then((response) => response.ok ? response.json() : []).then(setEmployees);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    const timer = window.setInterval(() => void loadMessages(activeId), 5000);
    return () => window.clearInterval(timer);
  }, [activeId, loadMessages]);

  async function startDirect(employee: Employee) {
    const response = await fetch("/api/connections/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DIRECT", memberIds: [employee.id] }),
    });
    if (!response.ok) return setError("Could not start conversation");
    const conversation = await response.json() as { id: string };
    setShowPeople(false);
    await loadConversations();
    setActiveId(conversation.id);
  }

  async function send() {
    const text = body.trim();
    if (!text || !activeId) return;
    setBody("");
    const response = await fetch(`/api/connections/conversations/${activeId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }),
    });
    if (!response.ok) { setBody(text); return setError("Message could not be sent"); }
    const message = await response.json() as Message;
    setMessages((current) => [...current, message]);
    void loadConversations();
  }

  const active = conversations.find((conversation) => conversation.id === activeId);
  return (
    <div className="grid min-h-[65vh] overflow-hidden rounded-xl border bg-white md:grid-cols-[18rem_1fr]">
      <aside className="border-b md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">Conversations</h2><Button size="sm" variant="outline" onClick={() => setShowPeople((value) => !value)}>New</Button></div>
        {showPeople ? <div className="border-b p-2"><p className="px-2 py-1 text-xs font-medium uppercase text-slate-500">Start a direct message</p>{employees.map((employee) => <button key={employee.id} onClick={() => void startDirect(employee)} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"><span className="block font-medium">{employee.preferredName || employee.name}</span><span className="text-xs text-slate-500">{employee.jobTitle || "Team member"}</span></button>)}</div> : null}
        <div className="max-h-72 overflow-y-auto md:max-h-[60vh]">{conversations.map((conversation) => <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={cn("block w-full border-b px-4 py-3 text-left", activeId === conversation.id ? "bg-slate-100" : "hover:bg-slate-50")}><span className="flex justify-between gap-2 font-medium"><span>{conversation.name}</span>{conversation.unreadCount ? <span className="rounded-full bg-slate-900 px-2 text-xs leading-5 text-white">{conversation.unreadCount}</span> : null}</span><span className="block truncate text-xs text-slate-500">{conversation.lastMessage?.body || "No messages yet"}</span></button>)}</div>
      </aside>
      <section className="flex min-h-[32rem] flex-col">
        <div className="border-b p-4"><h2 className="font-semibold">{active?.name || "Choose a conversation"}</h2></div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((message) => <div key={message.id} className={cn("max-w-[80%] rounded-xl px-3 py-2 text-sm", message.sender.id === currentEmployeeId ? "ml-auto bg-slate-900 text-white" : "bg-slate-100")}><p className="mb-1 text-xs font-medium opacity-70">{message.sender.preferredName || message.sender.name}</p><p className="whitespace-pre-wrap break-words">{message.body}</p></div>)}{error ? <p className="text-sm text-red-600">{error}</p> : null}</div>
        {activeId ? <form className="flex gap-2 border-t p-4" onSubmit={(event) => { event.preventDefault(); void send(); }}><Input value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} placeholder="Write a message…" aria-label="Message"/><Button type="submit" disabled={!body.trim()}>Send</Button></form> : null}
      </section>
    </div>
  );
}
