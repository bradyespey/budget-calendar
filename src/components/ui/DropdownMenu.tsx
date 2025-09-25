import React, { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { clsx } from 'clsx';

interface DropdownMenuProps {
  children: React.ReactNode;
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ children }) => {
  return <Menu as="div" className="relative inline-block text-left">{children}</Menu>;
};

const DropdownMenuTrigger: React.FC<DropdownMenuTriggerProps> = ({ children, asChild }) => {
  if (asChild) {
    return <Menu.Button as={Fragment}>{children}</Menu.Button>;
  }
  return <Menu.Button>{children}</Menu.Button>;
};

const DropdownMenuContent: React.FC<DropdownMenuContentProps> = ({ 
  children, 
  align = 'start',
  className = '' 
}) => {
  return (
    <Transition
      as={Fragment}
      enter="transition ease-out duration-100"
      enterFrom="transform opacity-0 scale-95"
      enterTo="transform opacity-100 scale-100"
      leave="transition ease-in duration-75"
      leaveFrom="transform opacity-100 scale-100"
      leaveTo="transform opacity-0 scale-95"
    >
      <Menu.Items 
        className={clsx(
          "absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-white dark:bg-gray-800 p-1 text-gray-900 dark:text-gray-100 shadow-md",
          align === 'end' ? 'right-0' : 'left-0',
          className
        )}
      >
        {children}
      </Menu.Items>
    </Transition>
  );
};

const DropdownMenuItem: React.FC<DropdownMenuItemProps> = ({ 
  children, 
  onClick,
  className = '' 
}) => {
  return (
    <Menu.Item>
      {({ active }: { active: boolean }) => (
        <button
          onClick={onClick}
          className={clsx(
            "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
            active 
              ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100" 
              : "text-gray-700 dark:text-gray-300",
            className
          )}
        >
          {children}
        </button>
      )}
    </Menu.Item>
  );
};

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
};
