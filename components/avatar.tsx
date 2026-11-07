"use client";

import Image from "next/image";
import { useState } from "react";

type AvatarProps = {
  image: string | null;
  /** Used for the initials fallback and alt text. Already resolved to something non-empty. */
  label: string;
  size?: number;
};

/**
 * The Google photo, or initials when there is no photo OR the photo fails to load (deleted,
 * expired URL, network error). A client component only because the fallback needs onError.
 */
export function Avatar({ image, label, size = 64 }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    return (
      <Image
        src={image}
        alt={`${label}'s profile photo`}
        width={size}
        height={size}
        className="rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${label}'s initials`}
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-neutral-200 text-lg font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
    >
      {initials(label)}
    </div>
  );
}

function initials(label: string): string {
  const words = label.split(/[\s@._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
