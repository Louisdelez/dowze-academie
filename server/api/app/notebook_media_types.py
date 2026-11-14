"""Closed managed-original MIME contract; ordinary private policy is unchanged.

No media decoder/conversion is introduced. Supported recorder codec parameters
remain exact stored metadata bound to the same SHA, bytes, receipt and asset.
"""
import re

MANAGED_BLOB_MEDIA_TYPES = frozenset({
    "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "application/octet-stream",
    "audio/wav", "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac", "audio/flac", "audio/aiff",
    "audio/x-wav", "audio/x-m4a", "audio/x-aiff", "audio/x-flac",
})
OPUS = re.compile(r'audio/(?:webm|ogg); ?codecs=(?:"(?:opus|vorbis)"|(?:opus|vorbis))\Z')
MP4 = re.compile(r'audio/mp4; ?codecs=(?:"mp4a\.40\.(?:2|5|29)"|mp4a\.40\.(?:2|5|29))\Z')


def managed_blob_media_type(value):
    return isinstance(value, str) and len(value) <= 128 and (value in MANAGED_BLOB_MEDIA_TYPES or OPUS.fullmatch(value) is not None or MP4.fullmatch(value) is not None)


def managed_upload_content_type(raw):
    # Blob.type is already ASCII-lowercase. Keep recorder parameters verbatim;
    # retain the prior base-type treatment for all non-audio request headers.
    value = raw.lower()
    return value if value.startswith("audio/") else value.split(";", 1)[0]
