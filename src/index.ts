import { access } from 'fs/promises';
import path from 'path';
import { pathToFileURL, URL } from 'url';
import { parse, resolve } from '@import-maps/resolve';

import type { ImportMap } from '@import-maps/resolve';
import type { PluginImpl } from 'rollup';
import { match } from 'assert';

interface ImportMapResolveOptions {
  /**
   * Base URL used when resolving any relative-URL-like address in the import map. The "address" is
   * the right-hand side of a mapping given in an import map. If a string is given, then it will
   * first be parsed to see if it is a valid URL. If it is, then it is used as is. Otherwise, the
   * given base URL is assumed to be either an absolute file system path or a path relative to the
   * current working directory. The file system path in either case is converted to a file URL. If
   * no base URL is given, then it defaults to the file URL of the current working directory.
   */
  baseUrl?: string | URL;

  importMap: ImportMap;
}

/**
 * Converts the given value to a {@link URL}.
 *
 * @param pathOrUrl Either a URL, an absolute file system path, or a file system path relative to
 * the current working directory.
 *
 * @returns A file {@link URL} if {@link pathOrUrl} is a file system path or the given
 * {@link pathOrUrl} converted as is to a {@link URL}.
 */
function convertToUrl(pathOrUrl: string) {
  // Need to first do file system path-based checks instead of simply seeing if the given value can
  // be parsed as a URL first. If the given value is an absolute Windows path, then new URL(baseUrl)
  // succeeds with a URL that has a protocol equal to the Windows drive letter, which is not what we
  // want.
  if (path.isAbsolute(pathOrUrl)) {
    return pathToFileURL(pathOrUrl);
  }

  // Next see if the given value is a valid URL. If so, use it as is.
  try {
    return new URL(pathOrUrl);
  }
  catch {
    // Assume it's some sort of relative file system path. pathToFileURL will automatically resolve
    // it absolutely for us.
    return pathToFileURL(pathOrUrl);
  }
}

function normalizeBaseUrl(baseUrl: string | URL) {
  if (baseUrl instanceof URL) {
    return baseUrl;
  }

  return convertToUrl(baseUrl);
}

const importMapResolve: PluginImpl<ImportMapResolveOptions> = (options) => {
  const baseUrl = normalizeBaseUrl(options?.baseUrl || process.cwd());
  const importMap = parse(options?.importMap || {}, baseUrl);

  return {
    name: 'import-map-resolve',

    async resolveId(source, importer) {
      // It seems the "script URL" the resolve function expects is supposed to be the URL of the
      // script/module that is importing the source module currently being considered for remapping.
      //
      // If an importer is given by Rollup, then that module's file URL gets used as the script URL
      // passed to resolve. If no importer is specified by Rollup, then assume the current source
      // module is a top-level entry point into the module graph, so set the script URL to the base
      // URL of the import map.
      const scriptUrl = importer ? convertToUrl(importer) : baseUrl;
      const { resolvedImport, matched } = resolve(source, importMap, scriptUrl);

      // console.log('source', source, 'importer', importer, 'resolvedImport', resolvedImport?.href, 'matched', matched);

      return matched
        ? { id: resolvedImport.href }
        : null;
    }
  };
};

export default importMapResolve;
