export type ChartDescriptor = {
  id: number;
  name: string;
  title: string;
  url: string;
  publication?: string;
  effective: string | null;
  withdrawn: string | null;
};
