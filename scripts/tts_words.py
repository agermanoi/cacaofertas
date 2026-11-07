"""Narração com edge-tts + tempo de cada palavra (para a legenda palavra por palavra).

    python3 scripts/tts_words.py <voz> <velocidade> <texto> <saida.mp3> <saida.json>

O JSON tem [{"w": "palavra", "s": início_em_s, "e": fim_em_s}, ...]. Se a voz não devolver
os tempos das palavras, o JSON fica vazio e o script do vídeo distribui pelo tamanho das palavras.
"""
import asyncio
import json
import sys

import edge_tts


async def main(voice: str, rate: str, text: str, mp3: str, out: str) -> None:
    try:
        com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    except TypeError:  # versões antigas não têm o parâmetro (e já mandam WordBoundary)
        com = edge_tts.Communicate(text, voice, rate=rate)
    words = []
    with open(mp3, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                s = chunk["offset"] / 1e7
                words.append({"w": chunk["text"], "s": round(s, 3), "e": round(s + chunk["duration"] / 1e7, 3)})
    with open(out, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:6]))
