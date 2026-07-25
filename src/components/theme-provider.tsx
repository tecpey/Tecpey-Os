'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      // TecPey landing should open in dark mode on first visit. Users can still toggle manually.
      //
      disableTransitionOnChange
      enableColorScheme
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
