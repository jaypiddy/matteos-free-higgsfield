"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Header,
  HeaderContainer,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
  SideNav,
  SideNavDivider,
  SideNavItems,
  SideNavLink,
  SkipToContent,
} from "@carbon/react";
import { Grid, Home, Image as ImageIcon, Settings, Video } from "@carbon/icons-react";
import { BRAND } from "@/lib/brand";

/**
 * Carbon UI Shell header.
 *
 * Home / Library / Settings are the header navigation; Image and Video — the
 * two things people come here to do — sit apart as global actions on the
 * right. Below the `lg` breakpoint Carbon hides the header navigation, so the
 * same destinations move into a side nav behind the menu button.
 */

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/library", label: "Library", icon: Grid },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const STUDIO = [
  { href: "/image", label: "Generate image", icon: ImageIcon },
  { href: "/video", label: "Generate video", icon: Video },
] as const;

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <Header aria-label={BRAND.name}>
          <SkipToContent href="#main-content" />
          <HeaderMenuButton
            aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
            isActive={isSideNavExpanded}
            aria-expanded={isSideNavExpanded}
            onClick={onClickSideNavExpand}
          />
          <HeaderName as={Link} href="/" prefix="">
            {BRAND.name}
          </HeaderName>

          <HeaderNavigation aria-label={BRAND.name}>
            {NAV.map(({ href, label }) => (
              <HeaderMenuItem key={href} as={Link} href={href} isActive={isActive(href)}>
                {label}
              </HeaderMenuItem>
            ))}
          </HeaderNavigation>

          <HeaderGlobalBar>
            {STUDIO.map(({ href, label, icon: Icon }) => (
              <HeaderGlobalAction
                key={href}
                aria-label={label}
                tooltipAlignment="end"
                isActive={isActive(href)}
                onClick={() => router.push(href)}
              >
                <Icon size={20} />
              </HeaderGlobalAction>
            ))}
          </HeaderGlobalBar>

          <SideNav
            aria-label="Side navigation"
            expanded={isSideNavExpanded}
            isPersistent={false}
            onSideNavBlur={onClickSideNavExpand}
          >
            <SideNavItems>
              {NAV.map(({ href, label, icon }) => (
                <SideNavLink
                  key={href}
                  as={Link}
                  href={href}
                  renderIcon={icon}
                  isActive={isActive(href)}
                  onClick={onClickSideNavExpand}
                >
                  {label}
                </SideNavLink>
              ))}
              <SideNavDivider />
              {STUDIO.map(({ href, label, icon }) => (
                <SideNavLink
                  key={href}
                  as={Link}
                  href={href}
                  renderIcon={icon}
                  isActive={isActive(href)}
                  onClick={onClickSideNavExpand}
                >
                  {label}
                </SideNavLink>
              ))}
            </SideNavItems>
          </SideNav>
        </Header>
      )}
    />
  );
}
