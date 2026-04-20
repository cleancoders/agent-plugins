---
name: creating-pages
description: Use when creating a new page or route in a ClojureScript SPA. Covers namespace creation, frontend/backend routes, main.cljs registration, and testing checklist.
---

# Creating a New ClojureScript Page

## Steps

1. **Create page namespace** with `defmethod page/render`:
   ```clojure
   (ns <project>.feature.my-page
     (:require [<project>.page :as page] ...))

   (defmethod page/render :my-page [_]
     [:div "My page content"])
   ```

2. **Add frontend route** in `routes.cljs`:
   ```clojure
   (defroute "/my-page" [] (load-user-page! :my-page))
   ```

3. **CRITICAL: Add backend route** in `routes.clj`:
   ```clojure
   ["/my-page" :get]  ; <- Serves web-rich-client for direct navigation/refresh
   ```

   **Why backend route is required:**
   - Frontend route only works when navigating within the app (SPA routing)
   - Direct navigation (typing URL, bookmarks) hits the backend first
   - Page refresh sends HTTP request to backend
   - Without backend route, users get 404 on refresh or direct navigation
   - Backend route serves the web-rich-client, then ClojureScript routing takes over

4. **CRITICAL: Register namespace in `main.cljs`**:
   ```clojure
   [<project>.feature.my-page]  ; <- Without this, page won't render!
   ```

5. **Add tests**:
   - Frontend route test in `spec/cljs/<project>/routes_spec.cljs`
   - Backend route test in `spec/clj/<project>/routes_spec.clj`
   - Page component tests

6. **Verify**:
   - Navigate within app (click button) - tests frontend route
   - **Refresh page** - tests backend route (CRITICAL to verify!)
   - Type URL directly in browser - tests backend route
   - All three should load the page successfully

## Checklist

- [ ] Create namespace with `defmethod page/render :page-name`
- [ ] **Add namespace to requires in `main.cljs`** <- Critical!
- [ ] Add frontend route in `routes.cljs`
- [ ] **Add backend route in `routes.clj`** <- Critical for refresh/direct navigation!
- [ ] Write frontend route tests in `routes_spec.cljs`
- [ ] Write backend route tests in `routes_spec.clj`
- [ ] Write page component tests
- [ ] **Verify by refreshing page in browser** <- Catches missing backend route!