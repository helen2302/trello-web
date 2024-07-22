import Box from '@mui/material/Box'
import ListColumns from './ListColumns/ListColumns'
import { DndContext, useSensor, useSensors, DragOverlay, defaultDropAnimationSideEffects, closestCorners, pointerWithin, getFirstCollision } from '@dnd-kit/core'
import { MouseSensor, TouchSensor } from '~/customLibraries/DndKitSensors'
import { useState, useEffect, useCallback, useRef } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import Column from './ListColumns/Column/Column'
import Card from './ListColumns/Column/ListCards/Card/Card'
import { cloneDeep, isEmpty } from 'lodash'
import { generatePlaceholderCard } from '~/utils/formatters'

const ACTIVE_DRAG_ITEM_TYPE = {
  COLUMN: 'ACTIVE_DRAG_ITEM_TYPE_COLUMN',
  CARD: 'ACTIVE_DRAG_ITEM_TYPE_CARD'
}
function BoardContent({ board, 
                        createNewColumn,
                        createNewCard, 
                        moveColumns, 
                        moveCardInTheSameColumn,
                        moveCardToDifferentColumn,
                        deleteColumnDetails }) {
  // Yêu cầu chuột di chuyển 10px mới kích hoạt event 
  // const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 10 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 500 }})
  
  const sensors = useSensors(mouseSensor, touchSensor)
  const [orderedColumns, setOrderedColumns] = useState([])

  // Cùng 1 thời điểm chỉ có 1 item đc kéo thẻ (column hoặc card)
  const [activeDragItemId, setActiveDragItemId] = useState(null)
  const [activeDragItemType, setActiveDragItemType] = useState(null)
  const [activeDragItemData, setActiveDragItemData] = useState(null)
  const [oldColumnWhenDraggingCard, setOldColumnWhenDraggingCard] = useState(null)
  //Điểm va chạm cuối cùng để xử lý thuật toán phát hiện va chạm 
  const lastOverId = useRef(null)
// Column đã được sắp xếp ở component cha cao nhất _id (v71)
  useEffect(() => { setOrderedColumns(board.columns) },[board])

  // Tìm 1 cái column theo cardId
  const findColumnByCardId = (cardId) => {
    return orderedColumns.find(column => column?.cards?.map(card => card._id)?.includes(cardId))
  }
// Cập nhật lại state trong trường hợp di chuyển card giữa các columns khác nhau 
  const moveCardBetweenDifferentColumns = (
    overColumn,
    overCardId,
    active,
    over,
    activeColumn,
    activeDraggingCardId,
    activeDraggingCardData,
    triggerFrom 
  ) => {
    setOrderedColumns(prevColumns => { 
      // Tìm vị trí của cái overCard mà activeCard sắp được thả 
      const overCardIndex = overColumn?.cards?.findIndex(card => card._id === overCardId)
      let newCardIndex
      const isBelowOverItem = active.rect.current.translated &&
        active.rect.current.translated.top > over.rect.top + over.rect.height
      const modifier = isBelowOverItem ? 1 : 0
      newCardIndex = overCardIndex >= 0 ? overCardIndex + modifier : overColumn?.card?.length + 1
      
      const nextColumns = cloneDeep(prevColumns)
      const nextActiveColumn = nextColumns.find( column => column._id === activeColumn._id )
      const nextOverColumn = nextColumns.find( column => column._id === overColumn._id )
      
      if(nextActiveColumn) {
        // Cần xóa card đang drag
        nextActiveColumn.cards = nextActiveColumn.cards.filter(card => card._id !== activeDraggingCardId)
        // Thêm placeholderCard nếu column đó rỗng (v37.2)
        if(isEmpty(nextActiveColumn.cards)){
          // console.log('Card cuoi cung keo di')
          nextActiveColumn.cards=[generatePlaceholderCard(nextActiveColumn)]
        }
        // Cập nhật lại cardOrderIds cho chuẩn dữ liệu 
        nextActiveColumn.cardOrderIds = nextActiveColumn.cards.map(card => card._id)
      }
      if(nextOverColumn) {
        // Kiêm tra xem card đang kéo có tồn tại ở overColumn chưa, nếu có thì xóa nó trước 
        nextOverColumn.cards = nextOverColumn.cards.filter(card => card._id !== activeDraggingCardId)
        // phải cập nhật chuẩn lại dữ liệu columnId trong card sau khi kéo card giữ 2 column khác nhau  
        const rebuild_activeDraggingCardData = {
          ...activeDraggingCardData,
          columnId: nextOverColumn._id
        }
        // Thêm card đang kéo vào overColumn theo vị trí mới
        nextOverColumn.cards = nextOverColumn.cards.toSpliced(newCardIndex, 0, rebuild_activeDraggingCardData)
        //xoa placeholderCard neu co(v37.2)
        nextOverColumn.cards = nextOverColumn.cards.filter(card => !card.FE_PlaceholderCard)
        // Cần xóa card đang drag
        nextOverColumn.cardOrderIds = nextOverColumn.cards.map(card => card._id)
      }
      // Nếu function này được gọi từ 'handleDragEnd'
      if (triggerFrom === 'handleDragEnd') {
      /* Gọi lên props function moveCardToDifferentColumn nằm ở component cha cao nhất (boards/_id.jsx) 
      Phải dùng tới activeDragItemData.columnId hoặc tốt nhất là oldColumnWhenDraggingCard,_id (set vào state từ bước handleDragStart) chứ không phải activeData trong scope handleDragEnd này vì sau khi đi qua onDragOver và tới đây là state của card đã bị cập nhật 1 lần r */ 
      moveCardToDifferentColumn(
        activeDraggingCardId,       oldColumnWhenDraggingCard._id, 
        nextOverColumn._id, 
        nextColumns)
      }
      return nextColumns
    })
  }
  const handleDragStart = (event) => {
    //console.log('handleDragStart ',event)
    setActiveDragItemId(event?.active?.id)
    setActiveDragItemType(event?.active?.data?.current?.columnId ? ACTIVE_DRAG_ITEM_TYPE.CARD : ACTIVE_DRAG_ITEM_TYPE.COLUMN)
    setActiveDragItemData(event?.active?.data?.current)
    if (event?.active?.data?.current?.columnId){
      setOldColumnWhenDraggingCard(findColumnByCardId(event?.active?.id))
    }
  }

  // Trigger trong quá trình kéo (drag) một phần tử 
  const handleDragOver = (event) => {
    // Không làm gì nếu đang kéo column
    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) return
    // Còn nếu kéo thả Card thì xử lý thêm để có thể kéo qua lại giữa các column
    const { active, over } = event
    if (!active || !over) return 
    // activeDraggingCard: là cái card đang được kéo 
    const { id: activeDraggingCardId, data: { current: activeDraggingCardData } } = active
    // overCard: là cái card đang tương tác trên hoặc dưới so với cái card được kéo  
    const { id: overCardId } = over
    // Tìm 2 columns theo cardId
    const activeColumn = findColumnByCardId(activeDraggingCardId)
    const overColumn = findColumnByCardId(overCardId)
    // Nếu không tồn tại 1 trong 2 columns thì không làm gì hết
    if (!activeColumn || !overColumn) return 
    // Xử lý logic khi và chỉ khi drag và drop cards ở 2 columns khác nhau,
    // còn nếu cùng 1 column thì không làm gì 
    // Vì đây đang là đoạn xử lý lúc kéo (handleDragOver), còn xử lý lúc kéo xong thì nó lại 
    // là vấn đề khác ở (handleDragEnd)
    if (activeColumn._id !== overColumn._id){
      moveCardBetweenDifferentColumns( overColumn, overCardId, active, over, activeColumn, activeDraggingCardId, activeDraggingCardData, 'handleDragOver' )
    }
  }

  const handleDragEnd = (event) => {
    const { active, over } = event

    if (!active || !over) return 
    //Xu ly keo tha card ở 2 columns khác nhau 
    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.CARD) 
    {
      // activeDraggingCard: là cái card đang được kéo 
      const { id: activeDraggingCardId, data: { current: activeDraggingCardData } } = active
      // overCard: là cái card đang tương tác trên hoặc dưới so với cái card được kéo  
      const { id: overCardId } = over
      // Tìm 2 columns theo cardId
      const activeColumn = findColumnByCardId(activeDraggingCardId)
      const overColumn = findColumnByCardId(overCardId)
      // Nếu không tồn tại 1 trong 2 columns thì không làm gì hết
      if (!activeColumn || !overColumn) return 
     
      if (oldColumnWhenDraggingCard._id !== overColumn._id){
        moveCardBetweenDifferentColumns( overColumn, overCardId, active, over, activeColumn, activeDraggingCardId, activeDraggingCardData, 'handleDragEnd' )
      }else{
        // keo tha trong cung 1 column
         // Lấy vị trí cũ( từ thằng oldColumnWhenDragginCard)
        const oldCardIndex = oldColumnWhenDraggingCard?.cards?.findIndex( c=> c._id === activeDragItemId)
         // Lấy vị trí mới( từ thằng over)
        const newCardIndex = overColumn?.cards?.findIndex( c=> c._id === overCardId)
        const dndOrderedCards = arrayMove(oldColumnWhenDraggingCard?.cards, oldCardIndex, newCardIndex)

        const dndOrderedCardIds = dndOrderedCards.map(card => card._id)
        // Vẫn gọi update state ở đây để tránh delay hoặc flickering giao diện lúc kéo thả cần phải chờ gọi API
        setOrderedColumns(prevColumns => { 
          const nextColumns = cloneDeep(prevColumns)
          const targetColumn = nextColumns.find(column => column._id === overColumn._id)
          // Cập nhật lại 2 giá trị card và cardOrderIds trong targetColumn
          targetColumn.cards = dndOrderedCards
          targetColumn.cardOrderIds = dndOrderedCardIds
          // Trả về state mới chuẩn vị trí 
          return nextColumns
        })
        moveCardInTheSameColumn(dndOrderedCards, dndOrderedCardIds, oldColumnWhenDraggingCard._id)
      }
    }
    //Xu ly keo tha column v35
    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) 
    { 
          // Kiểm tra nếu không tồn tại over( kéo linh tinh ra ngoài thì return luôn tránh lỗi)
      if (active.id !== over.id){
        // Lấy vị trí cũ( từ thằng active)
        const oldColumnIndex = orderedColumns.findIndex( c=> c._id === active.id)
        // Lấy vị trí mới( từ thằng over)
        const newColumnIndex = orderedColumns.findIndex( c=> c._id === over.id)
        // Dùng arrayMove để sắp xếp lại array Columns ban đầu 
        const dndOrderedColumns = arrayMove(orderedColumns, oldColumnIndex, newColumnIndex)
        //vẫn gọi update state tránh delay hoặc flickering dao diện 
        setOrderedColumns(dndOrderedColumns)  
  // gọi lên props function moveColumns nằm ở component cha cao nhất boards/_id.jsx
        moveColumns(dndOrderedColumns)
      }
    }
    // Những dữ liệu sao khi kéo thả phải đưa về null
    setActiveDragItemData(null)
    setActiveDragItemId(null)
    setActiveDragItemType(null)
    setOldColumnWhenDraggingCard(null)
  }

  // Animation khi thả phần tử- Test bằng cách kéo xong thả trực tiếp
// và nhìn phần giữ chỗ overlay (v32)
  const customDropAnimation = { sideEffects: defaultDropAnimationSideEffects ({ styles: { active: { opacity: '0.5' }}})}

  const collisionDetectionStrategy = useCallback((args) => {
    if (activeDragItemType ===  ACTIVE_DRAG_ITEM_TYPE.COLUMN) return closestCorners({ ...args })
    // Tìm các điểm giao nhau va chạm với con trỏ 
    const pointerIntersections = pointerWithin(args)
    if(!pointerIntersections?.length) return
    //Thuật toán tìm điểm va chạm-intersection với con trỏ   
    // const intersections = !!pointerIntersections?.length  ? pointerIntersections : rectIntersection(args)
    // tìm thằng đầu tiên trong pointerIntersections
    let overId = getFirstCollision(pointerIntersections, 'id')
    if (overId) {
// v37 Đoạn này fix bugs flickering. Nếu cái over nó là column thì sẽ tìm tới cái cardId gần nhất trong khu vực va chạm bằng cách dùng thuật toán phát hiện va chạm closestCenter hoặc closestCorners nhưng closestCorners mượt mà hơn 
      const checkColumn = orderedColumns.find(column => column._id === overId)
      if (checkColumn){
        // console.log('before ',overId)
        overId = closestCorners({
          ...args,
          droppableContainers: args.droppableContainers.filter(container => {
            return (container.id !== overId) && (checkColumn?.cardOrderIds?.includes(container.id))
          })
        })[0]?.id
        // console.log('after ',overId)
      }
      lastOverId.current = overId
      return [{ id: overId}]
    }
    return lastOverId.current ? [{ id: lastOverId.current }] : []
  },[activeDragItemType, orderedColumns])
  return (
    <DndContext 
    // cam bien v30
      sensors = { sensors }
      // Thuật toán phát hiện va chamj v33
      collisionDetection = { collisionDetectionStrategy }
      onDragStart = { handleDragStart }
      onDragOver = { handleDragOver }
      onDragEnd = { handleDragEnd }>
      <Box sx={{
        backgroundColor: (theme) => (theme.palette.mode === 'dark' ? '#34495e' : '#1976d2'),
        width: '100%',
        height: (theme) => theme.trello.boardContentHeight,
        p: '10px 0'
      }}>
        <ListColumns 
          columns = { orderedColumns }
          createNewColumn = { createNewColumn }
          createNewCard = { createNewCard }
          deleteColumnDetails = { deleteColumnDetails }
        />
        {/* Kéo thả làm sao vẫn có một thằng mờ mờ giữ chỗ, opacity */}
        <DragOverlay dropAnimation = { customDropAnimation }>
          { !activeDragItemType && null }
          { (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) && <Column column = { activeDragItemData }/> }
          { (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.CARD) && <Card card = { activeDragItemData }/> }
        </DragOverlay>
      </Box>
    </DndContext>
  )
}
export default BoardContent