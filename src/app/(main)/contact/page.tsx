"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");
      toast.success("Message sent! We'll get back to you soon.");
      setName("");
      setEmail("");
      setMessage("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send message"
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Contact Us</h1>
          <p className="text-[#a1a1a1]">
            Have a question, feedback, or need help? We&apos;d love to hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 text-center">
            <Mail className="w-8 h-8 text-[#00FF88] mx-auto mb-3" />
            <h3 className="text-white font-semibold mb-2">Email</h3>
            <a href="mailto:admin@greenroom.fm" className="text-[#00FF88] hover:underline text-sm">
              admin@greenroom.fm
            </a>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 text-center">
            <MessageSquare className="w-8 h-8 text-[#00FF88] mx-auto mb-3" />
            <h3 className="text-white font-semibold mb-2">Response Time</h3>
            <p className="text-[#a1a1a1] text-sm">Usually within 24 hours</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#a1a1a1] mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white placeholder-[#666] focus:border-[#00FF88] focus:outline-none transition"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#a1a1a1] mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white placeholder-[#666] focus:border-[#00FF88] focus:outline-none transition"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#a1a1a1] mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white placeholder-[#666] focus:border-[#00FF88] focus:outline-none transition resize-none"
              placeholder="How can we help?"
            />
          </div>
          <Button
            type="submit"
            disabled={sending}
            className="w-full bg-[#00FF88] text-black hover:bg-[#00cc6a] font-semibold py-3"
          >
            {sending ? "Sending..." : "Send Message"}
          </Button>
        </form>
      </div>
    </div>
  );
}
