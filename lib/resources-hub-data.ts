export type ResourceLink = {
  href: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
};

export type ResourceGroup = {
  title: string;
  description: string;
  items: ResourceLink[];
};

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    title: "Learn",
    description: "Long-form education from first trade to portfolio construction.",
    items: [
      {
        href: "/learn",
        title: "Learn library",
        description: "50 free guides for beginners and intermediate investors.",
        icon: "menu_book",
        badge: "50 guides",
      },
      {
        href: "/blog",
        title: "Blog",
        description: "Product updates, workflows, and market reads from the desk.",
        icon: "article",
      },
    ],
  },
  {
    title: "Workflows",
    description: "Pick a path that matches how you actually research.",
    items: [
      {
        href: "/guides",
        title: "Research guides",
        description: "Start paths, weekly workflow, and links to every free tool.",
        icon: "map",
      },
      {
        href: "/use-cases",
        title: "Use cases",
        description: "Dividend, swing, and earnings workflows mapped to tools.",
        icon: "route",
      },
    ],
  },
  {
    title: "Compare",
    description: "See how stocksbrew fits next to other research stacks.",
    items: [
      {
        href: "/radar",
        title: "Radar product page",
        description: "Indexable overview of buy/hold/sell calls and portfolio health.",
        icon: "radar",
      },
      {
        href: "/compare",
        title: "Compare stocksbrew",
        description: "Side-by-side with Finviz, TradingView, Yahoo Finance, and more.",
        icon: "balance",
      },
      {
        href: "/resources",
        title: "Link & share",
        description: "Copy URLs and outreach blurbs for blog posts and community answers.",
        icon: "link",
      },
    ],
  },
];

export const ALL_RESOURCES: ResourceLink[] = RESOURCE_GROUPS.flatMap((g) => g.items);
