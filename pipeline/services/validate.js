import path from 'path';

/**
 * Shared input validation for pipeline routes.
 *
 * Project ids and segment ids are interpolated into filesystem paths
 * (path.join(workspace, projectId, ...)), so they MUST be validated
 * before any fs access — otherwise a "../" in the id escapes the
 * workspace (path traversal → arbitrary read / write / recursive delete).
 */

// Alphanumeric + underscore/hyphen, 1–64 chars. No "." (blocks "..", dotfiles)
// and no path separators.
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidProjectId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

export function isValidSegmentId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/**
 * Express param-validation middleware factory. Use as
 *   router.param('projectId', validateIdParam('projectId'))
 * so the id is rejected with 400 before any handler touches the fs.
 */
export function validateIdParam(paramName = 'projectId') {
  return (req, res, next, value) => {
    if (!isValidProjectId(value)) {
      return res.status(400).json({
        error: `Invalid ${paramName}. Use alphanumeric, underscore, or hyphen (max 64 chars).`,
      });
    }
    next();
  };
}

/**
 * Join untrusted path parts onto a base directory and assert the result
 * stays inside that base. Returns the resolved absolute path, or throws
 * if the parts would escape `base`.
 */
export function safeJoinWithin(base, ...parts) {
  const baseResolved = path.resolve(base);
  const target = path.resolve(baseResolved, ...parts);
  const rel = path.relative(baseResolved, target);
  if (rel === '' || rel === '.' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    return target;
  }
  throw new Error('Resolved path escapes its base directory.');
}
