import { Route } from '@/lib/routes';

export const routes = {
  login: new Route('/login'),
  library: new Route('/'),
  recipeNew: new Route('/r/new'),
  recipe: new Route('/r/:id', { id: Number }),
  cook: new Route('/r/:id/cook', { id: Number }),
};
