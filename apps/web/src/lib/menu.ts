/** Menu configuration (PRD 25).

 * Each menu item declares the permission required to see it.
 * The sidebar filters items based on the user's permission set.
 */
export interface MenuNode {
  href: string;
  label: string;
  /** Permission code needed to display this menu item. */
  permission: string;
  /** Optional icon slot; empty for now. */
  icon?: string;
}

export const MENU: MenuNode[] = [
  { href: '/', label: 'Dashboard', permission: 'dashboard.view' },
  { href: '/pos', label: 'POS', permission: 'sales.create' },
  { href: '/products', label: 'Products', permission: 'product.view' },
  { href: '/inventory', label: 'Inventory', permission: 'inventory.view' },
  { href: '/sales', label: 'Sales', permission: 'sales.view' },
  { href: '/customers', label: 'Customers', permission: 'customer.view' },
  { href: '/reports', label: 'Reports', permission: 'report.view' },
  { href: '/users', label: 'Users', permission: 'user.manage' },
  { href: '/roles', label: 'Role & Permission', permission: 'user.manage' },
  { href: '/audit', label: 'Audit Log', permission: 'audit.view' },
  { href: '/settings', label: 'Settings', permission: 'settings.manage' },
];
