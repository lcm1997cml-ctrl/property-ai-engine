"use client";

import { MessageCircle } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/config";
import { cn } from "@/lib/utils";

interface WhatsAppCTAProps {
  message: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "outline" | "ghost";
  className?: string;
  block?: boolean; // full width
}

export default function WhatsAppCTA({
  message,
  label = "WhatsApp 查詢",
  size = "md",
  variant = "primary",
  className,
  block = false,
}: WhatsAppCTAProps) {
  const url = buildWhatsAppUrl(message);

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-2",
  };

  const iconSize = { sm: 14, md: 16, lg: 18 };

  const variantClasses = {
    primary: "bg-green-500 hover:bg-green-600 text-white shadow-sm",
    outline: "border border-green-500 text-green-600 hover:bg-green-50",
    ghost: "text-green-600 hover:bg-green-50",
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-lg transition-colors",
        sizeClasses[size],
        variantClasses[variant],
        block && "w-full",
        className
      )}
    >
      <MessageCircle size={iconSize[size]} />
      {label}
    </a>
  );
}
