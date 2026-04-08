#!/usr/bin/env bash
# HoloScope 학습 모니터

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

LOG="${1:-"${PROJECT_DIR}/train_cpu.log"}"
CKPT="${PROJECT_DIR}/checkpoints/checkpoint.pth"
REFRESH=3

# 색상
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
MAGENTA='\033[0;35m'

while true; do
    clear

    # ── 헤더 ──────────────────────────────────────────────
    echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}║        HoloScope 학습 모니터                     ║${RESET}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
    echo -e "${DIM}$(date '+%Y-%m-%d %H:%M:%S')  |  log: $LOG${RESET}"
    echo ""

    if [[ ! -f "$LOG" ]]; then
        echo -e "${RED}로그 파일 없음: $LOG${RESET}"
        sleep "$REFRESH"; continue
    fi

    # ── 프로세스 상태 ──────────────────────────────────────
    PID=$(ps aux | grep -v grep | awk '/\.venv.*python.*train\.py/{print $2}' | head -1)
    if [[ -n "$PID" ]]; then
        CPU=$(ps -p "$PID" -o %cpu= 2>/dev/null | tr -d ' ')
        MEM=$(ps -p "$PID" -o %mem= 2>/dev/null | tr -d ' ')
        START=$(ps -p "$PID" -o lstart= 2>/dev/null | xargs)
        echo -e "${GREEN}● 학습 중${RESET}  PID=${PID}  CPU=${CPU}%  MEM=${MEM}%  시작=${START}"
    else
        echo -e "${RED}✗ 프로세스 없음 (중단됨)${RESET}"
    fi
    echo ""

    # ── 디바이스 정보 ──────────────────────────────────────
    DEVICE=$(grep -m1 "^Device:" "$LOG" 2>/dev/null | tail -1)
    [[ -n "$DEVICE" ]] && echo -e "${DIM}$DEVICE${RESET}"
    echo ""

    # ── 완료된 epoch 파싱 ─────────────────────────────────
    # tqdm \r 제거 후 epoch 결과 라인만 추출
    EPOCH_LINES=$(tr '\r' '\n' < "$LOG" | grep -oP "Epoch\s+\d+/\d+ \| train_loss:.*val_acc: [0-9.]+")

    # Phase 1 epoch 수
    P1_TOTAL=$(grep -m1 "phase1_epochs\|Phase 1 시작" "$LOG" | grep -oP '\d+(?= epochs)' | head -1)
    [[ -z "$P1_TOTAL" ]] && P1_TOTAL=$(tr '\r' '\n' < "$LOG" | grep -oP "Epoch\s+\d+/(\d+)" | grep -oP "/\d+" | sort -t/ -k2 -n | head -1 | tr -d '/')
    [[ -z "$P1_TOTAL" ]] && P1_TOTAL=5

    P2_TOTAL=$(tr '\r' '\n' < "$LOG" | grep -oP "Phase 2 시작 \(\d+ epochs" | grep -oP "\d+" | head -1)
    [[ -z "$P2_TOTAL" ]] && P2_TOTAL=30

    # best val_acc
    BEST=$(tr '\r' '\n' < "$LOG" | grep -oP "best 저장 \(val_acc: [0-9.]+\)" | grep -oP "[0-9.]+" | sort -n | tail -1)
    [[ -z "$BEST" ]] && BEST="—"

    # ── Phase 1 결과 ───────────────────────────────────────
    P1_LINES=$(echo "$EPOCH_LINES" | grep -P "Epoch\s+\d+/$P1_TOTAL \|" | grep -v "^$")
    P1_DONE=$(echo "$P1_LINES" | grep -c "Epoch" 2>/dev/null); P1_DONE=${P1_DONE:-0}

    echo -e "${BOLD}[ Phase 1 — Head 학습 ]${RESET}  ${DIM}(${P1_DONE}/${P1_TOTAL} epochs)${RESET}"
    if [[ -n "$P1_LINES" ]]; then
        echo "$P1_LINES" | while IFS= read -r line; do
            EP=$(echo "$line" | grep -oP "Epoch\s+\K\d+")
            TLOSS=$(echo "$line" | grep -oP "train_loss: \K[0-9.]+")
            TACC=$(echo "$line"  | grep -oP "train_acc: \K[0-9.]+")
            VLOSS=$(echo "$line" | grep -oP "val_loss: \K[0-9.]+")
            VACC=$(echo "$line"  | grep -oP "val_acc: \K[0-9.]+")
            printf "  ${DIM}Ep%2s${RESET}  loss ${CYAN}%-6s${RESET} → ${CYAN}%-6s${RESET}  acc ${YELLOW}%-6s${RESET} → ${GREEN}%-6s${RESET}\n" \
                "$EP" "$TLOSS" "$VLOSS" "$TACC" "$VACC"
        done
    else
        echo -e "  ${DIM}(아직 없음)${RESET}"
    fi

    # Phase 1 완료 여부
    if [[ "$P1_DONE" -ge "$P1_TOTAL" ]]; then
        echo -e "  ${GREEN}✓ Phase 1 완료${RESET}"
    fi
    echo ""

    # ── Phase 2 결과 ───────────────────────────────────────
    # Phase 2 epoch 라인: "Epoch  N/30" 형태인데 Phase2 시작 이후 등장
    P2_LINES=$(echo "$EPOCH_LINES" | grep -P "Epoch\s+\d+/$P2_TOTAL \|" | grep -v "^$")
    P2_DONE=$(echo "$P2_LINES" | grep -c "Epoch" 2>/dev/null); P2_DONE=${P2_DONE:-0}

    echo -e "${BOLD}[ Phase 2 — 전체 fine-tune ]${RESET}  ${DIM}(${P2_DONE}/${P2_TOTAL} epochs)${RESET}"
    if [[ -n "$P2_LINES" ]]; then
        # 마지막 10개만 출력
        echo "$P2_LINES" | tail -10 | while IFS= read -r line; do
            EP=$(echo "$line" | grep -oP "Epoch\s+\K\d+")
            TLOSS=$(echo "$line" | grep -oP "train_loss: \K[0-9.]+")
            TACC=$(echo "$line"  | grep -oP "train_acc: \K[0-9.]+")
            VLOSS=$(echo "$line" | grep -oP "val_loss: \K[0-9.]+")
            VACC=$(echo "$line"  | grep -oP "val_acc: \K[0-9.]+")
            # best 표시
            MARK=""
            if grep -qP "best 저장 \(val_acc: $VACC\)" "$LOG" 2>/dev/null; then
                MARK=" ${YELLOW}★${RESET}"
            fi
            printf "  ${DIM}Ep%2s${RESET}  loss ${CYAN}%-6s${RESET} → ${CYAN}%-6s${RESET}  acc ${YELLOW}%-6s${RESET} → ${GREEN}%-6s${RESET}%b\n" \
                "$EP" "$TLOSS" "$VLOSS" "$TACC" "$VACC" "$MARK"
        done
        [[ "$P2_DONE" -gt 10 ]] && echo -e "  ${DIM}(이전 $((P2_DONE-10))개 epoch 생략)${RESET}"
    else
        echo -e "  ${DIM}(아직 없음)${RESET}"
    fi
    echo ""

    # ── 현재 진행 중인 배치 ────────────────────────────────
    PROGRESS=$(tail -c 4096 "$LOG" | tr '\r' '\n' | grep -oP "(train|val):\s+\d+%\|.*\|.*" | tail -1)
    if [[ -n "$PROGRESS" ]]; then
        echo -e "${BOLD}[ 현재 배치 진행 ]${RESET}"
        echo -e "  ${MAGENTA}${PROGRESS}${RESET}"
        echo ""
    fi

    # ── 요약 ──────────────────────────────────────────────
    echo -e "${BOLD}[ 요약 ]${RESET}"
    echo -e "  Best val_acc : ${GREEN}${BOLD}${BEST}${RESET}"
    TOTAL_DONE=$((P1_DONE + P2_DONE))
    TOTAL_ALL=$((P1_TOTAL + P2_TOTAL))
    echo -e "  전체 진행   : ${TOTAL_DONE} / ${TOTAL_ALL} epochs"

    # 체크포인트 시각
    if [[ -f "$CKPT" ]]; then
        CKPT_TIME=$(stat -c '%y' "$CKPT" 2>/dev/null | cut -d'.' -f1)
        echo -e "  체크포인트  : ${DIM}${CKPT_TIME}${RESET}"
    else
        echo -e "  체크포인트  : ${DIM}없음${RESET}"
    fi

    echo ""
    echo -e "${DIM}${REFRESH}초마다 갱신 | Ctrl+C 종료${RESET}"

    sleep "$REFRESH"
done
