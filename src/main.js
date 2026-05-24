import MiniReact from './miniReact'

const {createElement,render,useState} = MiniReact

function Counter(){
    const [count,setCount] = useState(0)

    return createElement(
        "div",
        { style: "padding: 10px; border: 1px solid #ccc; margin: 10px;" },
        createElement(
            "h1",
            null,
            `Count: ${count}`
        ),
        createElement(
            "button",
            {onClick:() => setCount(count+1)},
            "+1"
        ),
        createElement(
            "button",
            {onClick:() => setCount(count-1)},
            "-1"
        )
    )
}

const container = document.getElementById("root")
console.log('准备渲染');
render(createElement(Counter),container)
console.log('渲染完成');