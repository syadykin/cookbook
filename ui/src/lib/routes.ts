/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Params as RRParams, generatePath, matchPath } from 'react-router';

type RegexMatchPlus<
  CharPattern extends string,
  T extends string,
> = T extends `${infer First}${infer Rest}`
  ? First extends CharPattern
    ? RegexMatchPlus<CharPattern, Rest> extends never
      ? First
      : `${First}${RegexMatchPlus<CharPattern, Rest>}`
    : never
  : never;

// prettier-ignore
type LowercaseChar = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j'
                   | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't'
                   | 'u' | 'v' | 'w' | 'x' | 'y' | 'z';

// prettier-ignore
type UppercaseChar = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J'
                   | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T'
                   | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

// prettier-ignore
type DigitChar = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

// prettier-ignore
type WordChar = LowercaseChar | UppercaseChar | DigitChar | '_';

type ParamChar = WordChar | '-';

type _PathParam<
  Path extends string,
  Optional extends boolean,
> = Path extends `${infer L}/${infer R}`
  ? _PathParam<L, Optional> | _PathParam<R, Optional>
  : Path extends `:${infer Param}`
    ? Param extends `${infer OptionalParam}?${string}`
      ? Optional extends false
        ? never
        : RegexMatchPlus<ParamChar, OptionalParam>
      : Optional extends false
        ? RegexMatchPlus<ParamChar, Param>
        : never
    : never;

type PathParam<Path extends string, Optional extends boolean> = Path extends '*' | '/*'
  ? Optional extends true
    ? '*'
    : never
  : Path extends `${infer Rest}/*`
    ? (Optional extends true ? '*' : never) | _PathParam<Rest, Optional>
    : _PathParam<Path, Optional>;

type ParamType = NumberConstructor | StringConstructor | BooleanConstructor;

type ParamTypeDesc<Path extends string, Optional extends boolean> = {
  [K in PathParam<Path, Optional>]: ParamType;
};

type ParamTyped<Type extends ParamType> = Type extends NumberConstructor
  ? number
  : Type extends StringConstructor
    ? string
    : Type extends BooleanConstructor
      ? boolean
      : never;

type ParamsRequired<Path extends string, Type extends ParamTypeDesc<Path, false>> = {
  [K in PathParam<Path, false>]: ParamTyped<Type[K]>;
};

type ParamsOptional<Path extends string, Type extends ParamTypeDesc<Path, true>> = {
  [K in PathParam<Path, true>]?: K extends '*' ? string | null : ParamTyped<Type[K]> | null;
};

type ParamsTyped<Path extends string, Type extends ParamTypeDesc<Path, any>> = ParamsRequired<
  Path,
  Type
> &
  ParamsOptional<Path, Type>;

type IsAllOptional<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T] extends never
  ? false
  : true;

/**
 * Represents a route in the application.
 *
 * @template Path - The path pattern of the route, e.g. "/users/:userId".
 * @template Type - An object describing the types of the route parameters.
 * @template Params - An object representing the actual parameters extracted from a path.
 */
export class Route<
  Path extends string,
  Type extends ParamTypeDesc<Path, any>,
  Params extends ParamsTyped<Path, Type> = ParamsTyped<Path, Type>,
> {
  public readonly path: Path;
  public readonly params: Type;

  constructor(path: Path, ...params: keyof Type extends never ? [] : [params: Type]) {
    this.path = path;
    if (params.length > 0) {
      this.params = params[0] as Type;
    } else {
      this.params = {} as Type;
    }
  }

  /**
   * Generates a URL path by substituting the route parameters with the provided values.
   * @param props An object containing the values for the route parameters.
   * @returns The generated URL path.
   */
  toPath(
    ...props: keyof Type extends never
      ? []
      : IsAllOptional<Params> extends true
        ? [params?: Params, qs?: Record<string, any>]
        : [params: Params, qs?: Record<string, any>]
  ): string {
    const [params, qs] = (props as [Params | undefined, Record<string, any> | undefined]) || [];
    const pathParams = params
      ? (Object.fromEntries(
          Object.entries(params).map(([key, value]) => {
            return [key, value === null || value === undefined ? null : String(value)];
          }),
        ) as { [K in PathParam<Path, any>]: string | null })
      : undefined;
    // react-router 7.1x types generatePath params by its own parser; ours are already checked above
    const path = generatePath(this.path, pathParams as any);

    if (!qs || Object.keys(qs).length === 0) {
      return path;
    }

    const queryString = new URLSearchParams(
      Object.entries(qs).map(([key, value]) => [key, String(value)]),
    ).toString();

    return `${path}?${queryString}`;
  }

  /**
   * Matches a given URL path against the route's path pattern and extracts
   * the parameters if it matches.
   * @param path The URL path to match against the route's pattern.
   * @param strict If true, the match must be exact (the entire path must match).
   *               If false, the match can be a prefix of the path.
   * @returns An object containing the extracted parameters if the path
   *          matches, or null otherwise.
   */
  match(path: string, strict = true): Params | null {
    const matches = matchPath(
      {
        path: this.path,
        caseSensitive: true,
        end: strict,
      },
      path,
    );

    if (!matches) {
      return null;
    }

    return this.typed(matches.params);
  }

  typed(params: RRParams<string>): Params | null {
    return Object.fromEntries(
      Object.entries(params).map(([key, value]) => {
        const desc = this.params[key as PathParam<Path, any>];
        if (desc === String) {
          return [key, value];
        }

        if (desc === Number) {
          const v = value !== null && value !== undefined && value !== '' ? Number(value) : null;
          return [key, Number.isNaN(v) ? null : v];
        }

        if (desc === Boolean) {
          return [key, ['true', 'True', 'TRUE', '1'].includes(value as string)];
        }

        return [key, value];
      }),
    ) as Params;
  }
}

export function matchRoute<T extends Route<string, any>>(
  routes: T[],
  pathname: string,
  substitute?: (route: T) => T | null | undefined,
): T | null {
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    if (route.match(pathname) !== null) {
      if (substitute) {
        const substituted = substitute(route);
        if (substituted || substituted === null) {
          return substituted;
        }
      }
      return route;
    }
  }

  return null;
}
