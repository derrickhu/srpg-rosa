"""色度键控（绿幕/洋红幕）抠图的共享实现。

抠图路线有两个入口，逻辑必须是同一份：
- `cutout-chroma.py`  一张图里若干独立道具，按连通列切开（号角、火把、战旗）
- `vfx-sheet.py --key` 网格多帧动画，按格切（蜂群）

**键色要挑主体里没有的那个色相**，这不是偏好问题。给蜜蜂用洋红键时，
模型不只在边缘渗色，它直接把粉画进了翅膀——13.6% 的可见像素是粉的，
其中 196 个是完全不透明的。换绿幕之后同一套判据下降到 0.06%。
所以：主体偏绿（药草、藤蔓、树皮）用洋红，主体偏暖（蜜蜂、火把、战旗）用绿幕。
"""

from __future__ import annotations

import numpy as np

# 键色 → (该高的通道, 该低的通道)
CHROMA_KEYS: dict[str, tuple[tuple[int, ...], tuple[int, ...]]] = {
    "magenta": ((0, 2), (1,)),
    "green": ((1,), (0, 2)),
}


def key_chroma(arr: np.ndarray, key: str, tol: int) -> np.ndarray:
    """色度键控，返回 alpha（0 或 255）。

    判据是「键色通道都高、其余通道都低」，而不是跟纯色比欧氏距离——
    生图给的键底并不纯，压缩和渐变会让洋红在 (230,20,230) 到 (255,0,255) 之间飘。
    """
    hi, lo = CHROMA_KEYS[key]
    a = arr[..., :3].astype(int)
    m = np.ones(arr.shape[:2], dtype=bool)
    for c in hi:
        m &= a[..., c] > 255 - tol
    for c in lo:
        m &= a[..., c] < tol
    return np.where(m, 0, 255).astype(np.uint8)


def despill_chroma(arr: np.ndarray, key: str) -> np.ndarray:
    """把渗进边缘的键色压回中性。

    不做的话半透明和浅色处会整片染上键色：箭羽发紫、蜜蜂翅膀发粉。
    """
    hi, lo = CHROMA_KEYS[key]
    out = arr[..., :3].astype(float)
    spill = np.clip(
        np.mean([out[..., c] for c in hi], axis=0) - np.mean([out[..., c] for c in lo], axis=0),
        0,
        None,
    )
    keep = spill > 12
    for c in hi:
        out[..., c] = np.where(keep, out[..., c] - spill * 0.55, out[..., c])
    res = arr.copy()
    res[..., :3] = np.clip(out, 0, 255).astype(np.uint8)
    return res


def prep_chroma(a: np.ndarray, key: str, tol: int) -> np.ndarray:
    """键底 RGBA → 透明底 RGBA。alpha 来自键控，不是来自亮度。"""
    out = despill_chroma(a, key)
    out[..., 3] = key_chroma(a, key, tol)
    return out
