export function slugify(string) {
    return string
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove invalid characters
        .replace(/\s+/g, '-')         // Replace spaces with dashes
        .replace(/-+/g, '-');         // Replace multiple dashes with a single dash
}