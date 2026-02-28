import type { PropsWithChildren } from 'react';
import { MantineProvider, createTheme, MantineColorsTuple } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

// Deep purple color matching the Sankey app
const deepPurple: MantineColorsTuple = [
  '#F3E5F5',
  '#E1BEE7',
  '#CE93D8',
  '#BA68C8',
  '#AB47BC',
  '#9C27B0',
  '#8E24AA',
  '#7B1FA2',
  '#6A1B9A',
  '#4A148C',
];

const theme = createTheme({
  primaryColor: 'deepPurple',
  colors: {
    deepPurple,
  },
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <MantineProvider theme={theme}>
      <Notifications position="top-right" zIndex={2000} />
      {children}
    </MantineProvider>
  );
}
