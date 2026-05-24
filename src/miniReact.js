let wipRoot = null //正在渲染的工作单元的根节点
let wipFiber = null //正在工作的fiber节点
let currentRoot = null //当前已提交的fiber树
let nextUnitOfWork = null //下一个要处理的fiber单元
let hookIndex = null //当前函数组件中的hook索引

function createElement(type,props,...children){
    return {
        type,
        props:{
            ...props,
            children:children.map((child) => {
                return typeof child === "object" && child!==null
                    ? child
                    : createTextElement(child)
            })
        }
    }
}

function createTextElement(text){
    return {
        type:"TEXT_ELEMENT",
        props:{
            nodeValue:text,
            children:[]
        }
    }
}

//创建DOM元素
function createDOM(fiber){
    const dom = fiber.type==="TEXT_ELEMENT"
        ?document.createTextNode("")
        :document.createElement(fiber.type)
    Object.keys(fiber.props) //获取对象中所有可枚举属性的键名
        .filter((key) => key!=="children")
        .forEach((key) => {
            dom[key]=fiber.props[key]
        })
    return dom
}

//生成fiber节点（beginWork）
function reconcileChildren(wipFiber,elements){
    let oldFiber = wipFiber.alternate ? wipFiber.alternate.child : null //初始为旧fiber节点的子节点
    let index = 0
    let prevSibling = null

    while(index<elements.length||oldFiber!=null){
        const element = index<elements.length ? elements[index] : null
        let newFiber = null

        const sameType = element && oldFiber && element.type==oldFiber.type
        //可复用节点（更新）
        if(sameType){
            newFiber={
                type:oldFiber.type,
                props:element.props,
                dom:oldFiber.dom,
                parent:wipFiber,
                alternate:oldFiber,
                effectTag:'UPDATE'
            }
        }
        //创建新节点
        if(element&&!sameType){
            newFiber={
                type:element.type,
                props:element.props,
                dom:null,
                parent:wipFiber,
                alternate:null,
                effectTag:'PLACEMENT'
            }
        }
        //删除旧节点
        if(oldFiber&&!sameType){
            oldFiber.effectTag='DELETION'
            if(!wipRoot.deletions){
                wipRoot.deletions=[]
            }
            wipRoot.deletions.push(oldFiber) //将事件加入队列
        }

        //将生成的fiber节点放入工作树
        if(index===0){
            wipFiber.child=newFiber
        }else if(prevSibling){
            prevSibling.sibling=newFiber
        }
        prevSibling=newFiber

        index++
        if(oldFiber){ //如果oldFiber==null,oldFiber.sibling会报错
            oldFiber = oldFiber.sibling //当处理完一个element和oldfiber时，移向下一个旧节点
        }
    }
}

//执行函数式组件
function updateFunctionComponent(fiber){
    wipFiber=fiber
    hookIndex=0
    wipFiber.hooks=[]
    const children = [fiber.type(fiber.props)] //fiber.type指函数本身，执行函数组件，返回JSX对象，用数组包装
    reconcileChildren(fiber,children)
}
//执行原生标签组件（如div,span）
function updateHostComponent(fiber){
    if(!fiber.dom){
        fiber.dom=createDOM(fiber)
    }
    const elements=fiber.props.children
    reconcileChildren(fiber,elements)
}

//render阶段递归（fiber架构的核心）
function performUnitOfWork(fiber){
    const isFounctionComponent = typeof fiber.type==="function" //fiber为函数组件或类组件
    if(isFounctionComponent){
        updateFunctionComponent(fiber)
    }else{   //"string"
        updateHostComponent(fiber)
    }

    //(递)
    if(fiber.child) return fiber.child
    //已经为叶子节点(归)
    let nextFiber=fiber
    while(nextFiber){
        if(nextFiber.sibling) return nextFiber.sibling
        nextFiber=nextFiber.parent
    }
}

//commit阶段：将fiber树更新到DOM
function commitRoot(){
    if(wipRoot?.deletions){
        wipRoot.deletions.forEach(commitDeletion)
    }
    commitWork(wipRoot.child) //wipRoot是一个fiber节点，不对应真实DOM，只是一个根容器，wiptRoot.child是真正的根组件或根元素
    currentRoot = wipRoot
    wipRoot = null
}

function commitDeletion(fiber){
    if(fiber.dom){
        let parentFiber = fiber.parent
        while(!parentFiber.dom){
            parentFiber=parentFiber.parent
        }
        parentFiber.dom.removeChild(fiber.dom)
    }else{
        commitDeletion(fiber.child)
    }
}

function commitWork(fiber){
    if(!fiber) return 
    
    if(typeof fiber.type === 'function'){
        commitWork(fiber.child)
        return
    }

    let domParentFiber = fiber.parent
    while(domParentFiber&&!domParentFiber.dom){ //找到第一个具有真实DOM节点的祖先fiber（不是每个fiber都有DOM）
        domParentFiber=domParentFiber.parent
    }
    const parentDom=domParentFiber.dom

    if(fiber.effectTag=="PLACEMENT"&&fiber.dom){
        parentDom.appendChild(fiber.dom)
        //调用 updateDom 来处理 PLACEMENT 节点的属性！
        updateDom(fiber.dom,{},fiber.props)
    }else if(fiber.effectTag=="UPDATE"&&fiber.dom){
        updateDom(fiber.dom,fiber.alternate?.props||{},fiber.props)
    }
    
    commitWork(fiber.child)
    commitWork(fiber.sibling)
}

//更新DOM
//完美处理了DOM属性更新的三大核心：事件监听，普通属性，样式更新
function updateDom(dom,prevProps,nextProps){
    //移除旧的事件监听器
    Object.keys(prevProps)
        .filter((key) => key.startsWith("on"))
        .filter((key) => !(key in nextProps)||prevProps[key]!==nextProps[key]) //事件被移除或监听函数被更换
        .forEach((name) => {
            const eventType = name.toLowerCase().substring(2) //"onClick"->"click"
            dom.removeEventListener(eventType,prevProps[name])
        })
    Object.keys(prevProps)
        .filter((key) => key!=="children")
        .filter((key) => !(key in nextProps))
        .forEach((key) => {
            dom[key]=""
        })
    Object.keys(nextProps)
        .filter((key) => key!=="children")
        .filter((key) => prevProps[key]!==nextProps[key])
        .forEach((key) => {
            dom[key]=nextProps[key]
        })
    //添加新的事件监听器
    Object.keys(nextProps)
        .filter((key) => key.startsWith("on"))
        .forEach((name) => {
            const eventType = name.toLowerCase().substring(2)
            dom.addEventListener(eventType,nextProps[name])
        })
}

//渲染入口
function render(element,container){
    wipRoot={
        dom:container,
        props:{
            children:[element]
        },
        alternate:currentRoot,
        deletions:[]
    }
    nextUnitOfWork = wipRoot
    requestIdleCallback(workLoop);
}

//循环调度器（浏览器空闲时执行）
function workLoop(deadline){
    let shouldYield = false
    while(nextUnitOfWork&&!shouldYield){
        nextUnitOfWork=performUnitOfWork(nextUnitOfWork)
        shouldYield=deadline.timeRemaining() < 1
    }
    if(!nextUnitOfWork&&wipRoot){ //存在没有更新到DOM的fiber
        commitRoot()
    }else{
        requestIdleCallback(workLoop);
    }
}

function useState(initial){
    const oldHook = wipFiber.alternate?.hooks?.[hookIndex]
    const hook  = {
        state:oldHook ? oldHook.state : initial,
        queue:[]
    }
    //获取上一次未处理的更新操作（通过setState提交）
    const actions = oldHook ? oldHook.queue : []
    actions.forEach((action) => {
        hook.state = typeof action === "function" ? action(hook.state) : action //基于旧状态计算新状态或直接替换
    })
    //setState用于记录意图，不会马上更新，真正的更新发生在下一轮的action.forEach
    const setState = (action) => { //这里的action是用户传入的新的更新操作
        hook.queue.push(action)
        wipRoot = {
            dom:currentRoot ? currentRoot.dom : null,
            props:currentRoot ? currentRoot.props : { children: [] },
            alternate:currentRoot,
            deletions:[]
        }
        nextUnitOfWork = wipRoot //调度器的入口，告诉React从wipRoot开始渲染
        requestIdleCallback(workLoop)
    }
    wipFiber.hooks.push(hook)
    hookIndex++
    return [hook.state,setState]
}

//导出API
export default {
    createElement,
    render,
    useState
}